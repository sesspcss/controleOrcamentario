/**
 * LC 131 - Dashboard Power BI Style v3
 * Abas, grupo simplificado (Custeio/Investimento/Pessoal),
 * fonte simplificada (Tesouro/Federal/Demais), filtros cascateados.
 */

import React, { useEffect, useState, useRef, useCallback, memo, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { appwrite as supabase } from './appwrite';  // ✅ MIGRADO: Supabase → Appwrite
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend,
} from 'recharts';
import {
  RefreshCw, AlertCircle, DollarSign, TrendingUp, CheckCircle2,
  Download, X, Upload, FileSpreadsheet,
  ChevronLeft, ChevronRight, ChevronDown, Settings,
  Database, BarChart3, Search, SlidersHorizontal,
  Building2, MapPin, Layers, Users, LayoutDashboard, FileText,
  Table2, Globe, Briefcase, Map as MapIcon, Menu, Lock, BookOpen, ExternalLink, Info, Tag,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SP_COORDS } from './sp-coords';
import { findRegionCoord } from './drs-coords';
import MUNICIPIOS_LOOKUP from './data/municipios_lookup.json';
import DESPESAS_LOOKUPS from './data/despesas_lookups.json';
import TIPO_LOOKUP from './data/tipo_by_elem_proj.json';

// --- Utility -------------------------------------------------------------------
function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

function fmt(val: number | null | undefined, type: 'currency' | 'number' | 'compact' = 'number'): string {
  if (val === null || val === undefined || isNaN(Number(val))) return ' -';
  const n = Number(val);
  if (type === 'currency') return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  ESTADUAL: '#118DFF', FEDERAL: '#12239E',
};
// Series padrão para gráficos com 3 grandezas (emp + liq + pago)
const S3 = [
  { key: 'empenhado',  name: 'Empenhado',  color: '#118DFF' },
  { key: 'liquidado',  name: 'Liquidado',  color: '#1AAB40' },
  { key: 'pago_total', name: 'Pago Total', color: '#E66C37' },
];
// Series padrão para gráficos com 2 grandezas (emp + pago_total)
const S2 = [
  { key: 'empenhado',  name: 'Empenhado',  color: '#118DFF' },
  { key: 'pago_total', name: 'Pago Total', color: '#E66C37' },
];

// --- Types ----------------------------------------------------------------------
type DataRow = Record<string, unknown>;
type Tab = 'resumo' | 'regional' | 'mapa' | 'despesas' | 'dados' | 'pivot' | 'legenda' | 'ob';

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
  if (d.includes('CONTRATO DE GESTAO') || d.includes('CONTRATO GESTAO')) return 'ORGANIZAÇÃO SOCIAL';
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
  if (d.includes('TABELASUS PAULISTA')) return 'TABELASUS PAULISTA';
  if (d.includes('TABELASUS PAULISTA')) return 'TABELASUS PAULISTA';
  if (d.includes('TABELASUS PAULISTA')) return 'TABELASUS PAULISTA';
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
    distinct_fonte: Array.from(new Set((d?.distinct_fonte as string[] ?? []).map(v => {
      const u = String(v).toUpperCase().trim();
      return (u.includes('FEDERAL') || u.includes('FED') || u.includes('FUNDO NACIONAL') || u.includes('TRANSFE') || u.includes('SUS')) ? 'FEDERAL' : 'ESTADUAL';
    }))).sort(),
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
    distinct_fonte: Array.from(new Set(rows.map(r => {
      const s = String(r.codigo_nome_fonte_recurso ?? r.fonte_recurso ?? '').toLowerCase();
      return (s.includes('fed') || s.includes('fundo nacional') || s.includes('transfe') || s.includes('sus') || s.includes('uniao') || s.includes('união')) ? 'FEDERAL' : 'ESTADUAL';
    }))).sort(),
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
    if (f.key === 'p_fonte_recurso') query = query.in('fonte_simpl', expanded);
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
    if (v === 'ESTADUAL') parts.push(
      'codigo_nome_fonte_recurso.ilike.%tesouro%',
      'and(codigo_nome_fonte_recurso.not.ilike.%fed%,codigo_nome_fonte_recurso.not.ilike.%fundo nacional%,codigo_nome_fonte_recurso.not.ilike.%transfer%,codigo_nome_fonte_recurso.not.ilike.%uniao%,codigo_nome_fonte_recurso.not.ilike.%uni%C3%A3o%,codigo_nome_fonte_recurso.not.ilike.%sus%)',
    );
    if (v === 'FEDERAL') parts.push(
      'codigo_nome_fonte_recurso.ilike.%fed%',
      'codigo_nome_fonte_recurso.ilike.%união%',
      'codigo_nome_fonte_recurso.ilike.%uniao%',
      'codigo_nome_fonte_recurso.ilike.%fundo nacional%',
      'codigo_nome_fonte_recurso.ilike.%transferência%',
      'codigo_nome_fonte_recurso.ilike.%transferencia%',
      'codigo_nome_fonte_recurso.ilike.%SUS%',
    );
  }
  return parts.join(',');
}

function enrichDetailRow(r: Record<string, unknown>): DetailRow {
  const row = r as unknown as DetailRow;
  const src = String(row.codigo_nome_fonte_recurso ?? '').toLowerCase();
  row.fonte_simpl = (src.includes('fed') || src.includes('união') || src.includes('uniao') || src.includes('fundo nacional')
       || src.includes('transferência') || src.includes('transferencia') || src.includes('sus')) ? 'FEDERAL' : 'ESTADUAL';
  const g = String(row.codigo_nome_grupo ?? '');
  row.grupo_simpl = g.startsWith('1') ? 'Pessoal' : g.startsWith('2') ? 'Dívida' : g.startsWith('3') ? 'Custeio' : g.startsWith('4') ? 'Investimento' : 'Outros';
  // Fallback: unidade uses codigo_nome_uo when not populated from source
  if (!row.unidade) row.unidade = String(row.codigo_nome_uo ?? '');
  // tipo_despesa is already enriched from TIPO_DESPESA.xlsx via tipo_despesa_ref
  row.pago_total = (Number(row.pago) || 0) + (Number(row.pago_anos_anteriores) || 0);
  return row;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'mapa',          label: 'Mapa',          icon: <MapIcon className="w-3.5 h-3.5" /> },
  { id: 'resumo',        label: 'Resumo',        icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: 'regional',      label: 'Regional',      icon: <Globe className="w-3.5 h-3.5" /> },
  { id: 'despesas',      label: 'Despesas',       icon: <Briefcase className="w-3.5 h-3.5" /> },
  { id: 'dados',         label: 'Dados',          icon: <Table2 className="w-3.5 h-3.5" /> },
  { id: 'pivot',         label: 'Tabela Dinâmica', icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
  { id: 'ob',            label: 'OB',             icon: <DollarSign className="w-3.5 h-3.5" /> },
  { id: 'legenda',       label: 'Legenda',          icon: <BookOpen className="w-3.5 h-3.5" /> },
];

// Pivot grouping dimensions — maps UI key → p_dim/p_subdim parameter values for lc131_pivot RPC
const PIVOT_DIMS: { key: string; label: string }[] = [
  { key: 'municipio',     label: 'Município'        },
  { key: 'drs',           label: 'DRS'              },
  { key: 'rras',          label: 'RRAS'             },
  { key: 'regiao_ad',     label: 'Região Admin.'    },
  { key: 'regiao_sa',     label: 'Região de Saúde'  },
  { key: 'grupo_despesa', label: 'Grupo Despesa'    },
  { key: 'elemento',      label: 'Elemento'         },
  { key: 'rotulo',        label: 'Rótulo'           },
  { key: 'fonte_recurso', label: 'Fonte de Recurso' },
  { key: 'fonte_simpl',   label: 'Estadual / Federal' },
  { key: 'tipo_despesa',  label: 'Tipo de Despesa'  },
];

// Multi-level pivot dimensions (lc131_pivot_multi RPC)
const MULTI_PIVOT_DIMS: { key: string; label: string }[] = [
  { key: 'municipio',     label: 'Município'                 },
  { key: 'drs',           label: 'DRS'                       },
  { key: 'rras',          label: 'RRAS'                      },
  { key: 'regiao_ad',     label: 'Região Admin.'             },
  { key: 'regiao_sa',     label: 'Região de Saúde'           },
  { key: 'fonte_simpl',   label: 'Fonte (ESTADUAL/FEDERAL)'  },
  { key: 'grupo_simpl',   label: 'Grupo (Custeio/Invest.)'   },
  { key: 'tipo_despesa',  label: 'Tipo de Despesa'           },
  { key: 'rotulo',        label: 'Rótulo'                    },
  { key: 'grupo_despesa', label: 'Grupo de Despesa (cód.)'   },
  { key: 'elemento',      label: 'Elemento'                  },
];

// ── Multi-level pivot tree types and helpers ──────────────────────────────

type MultiPivotRow = {
  d1: string; d2: string|null; d3: string|null; d4: string|null;
  ano_referencia: number; empenhado: number; liquidado: number; pago_total: number;
};

type PivotTreeNode = {
  key: string; label: string; level: number; isLeaf: boolean;
  byYear: Record<number, number>; total: number; children: PivotTreeNode[];
};

type FlatPivotRow = {
  key: string; label: string; level: number; isLeaf: boolean;
  hasChildren: boolean; byYear: Record<number, number>; total: number;
};

function buildPivotTree(
  rows: MultiPivotRow[], numDims: number,
  valueKey: 'pago_total' | 'empenhado' | 'liquidado',
  level = 0, parentKey = '',
): PivotTreeNode[] {
  if (level >= numDims || !rows.length) return [];
  const dk = (['d1','d2','d3','d4'] as const)[level];
  const map = new Map<string, { rows: MultiPivotRow[]; byYear: Record<number,number>; total: number }>();
  for (const row of rows) {
    const label = String(row[dk] ?? '(Vazio)');
    if (!map.has(label)) map.set(label, { rows: [], byYear: {}, total: 0 });
    const n = map.get(label)!;
    n.rows.push(row);
    const v = Number(row[valueKey] ?? 0);
    n.byYear[row.ano_referencia] = (n.byYear[row.ano_referencia] ?? 0) + v;
    n.total += v;
  }
  const isLeaf = level === numDims - 1;
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
    .map(([label, d]) => {
      const key = parentKey ? `${parentKey}\x00${label}` : label;
      return {
        key, label, level, isLeaf,
        byYear: d.byYear, total: d.total,
        children: isLeaf ? [] : buildPivotTree(d.rows, numDims, valueKey, level + 1, key),
      };
    });
}

function flattenVisiblePivot(
  nodes: PivotTreeNode[], expanded: Set<string>, result: FlatPivotRow[] = [],
): FlatPivotRow[] {
  for (const node of nodes) {
    result.push({
      key: node.key, label: node.label, level: node.level,
      isLeaf: node.isLeaf, hasChildren: node.children.length > 0,
      byYear: node.byYear, total: node.total,
    });
    if (!node.isLeaf && expanded.has(node.key) && node.children.length > 0) {
      flattenVisiblePivot(node.children, expanded, result);
    }
  }
  return result;
}

function collectAllPivotKeys(nodes: PivotTreeNode[], result: string[] = []): string[] {
  for (const n of nodes) {
    if (n.children.length > 0) { result.push(n.key); collectAllPivotKeys(n.children, result); }
  }
  return result;
}

// Filters shown in the pivot's own filter panel (subset of FILTER_META)
const PIVOT_FILTER_KEYS = new Set(['p_drs','p_rras','p_regiao_ad','p_regiao_sa','p_municipio','p_grupo_despesa','p_tipo_despesa','p_rotulo','p_elemento']);

type UploadStep = 'idle'|'parsing'|'preview'|'uploading'|'processing'|'done'|'error';

function parseCSV(text: string): DataRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h =>
    h.replace(/"/g, '').trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^_+|_+$/g, '').replace(/__+/g, '_')
  );
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

function Card({ title, children, badge, noPad, icon, info }: {
  title: string; children: React.ReactNode; badge?: React.ReactNode; noPad?: boolean; icon?: React.ReactNode; info?: string;
}) {
  const [showInfo, setShowInfo] = React.useState(false);
  const [popPos, setPopPos] = React.useState({ top: 0, right: 0 });
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const popRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!showInfo) return;
    const h = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (popRef.current && !popRef.current.contains(e.target as Node)) setShowInfo(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showInfo]);
  const handleToggle = () => {
    if (!showInfo && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPopPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setShowInfo(v => !v);
  };
  return (
    <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#F0F0F0] flex items-center gap-2">
        {icon && <span className="text-[#999]">{icon}</span>}
        <p className="font-semibold text-[#333] text-[13px] flex-1">{title}</p>
        {badge}
        {info && (
          <>
            <button
              ref={btnRef}
              type="button"
              onClick={handleToggle}
              title="Como este gráfico é calculado"
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0',
                showInfo ? 'text-[#118DFF]' : 'text-[#B0B0B0] hover:text-[#118DFF]'
              )}>
              <Info className="w-4 h-4" />
            </button>
            {showInfo && ReactDOM.createPortal(
              <div
                ref={popRef}
                className="fixed z-[9999] w-80 bg-white border border-[#E0E0E0] rounded-xl shadow-2xl text-[11px] text-[#444] leading-relaxed overflow-hidden"
                style={{ top: popPos.top, right: popPos.right, maxHeight: '70vh' }}>
                <div className="flex items-center gap-2 px-4 py-2.5 bg-[#F5F9FF] border-b border-[#E0E0E0] sticky top-0">
                  <Info className="w-3.5 h-3.5 text-[#118DFF] shrink-0" />
                  <span className="text-[#118DFF] font-bold text-[12px]">Como este gráfico é calculado</span>
                  <button onClick={() => setShowInfo(false)} className="ml-auto text-[#BBB] hover:text-[#666]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="px-4 py-3 overflow-y-auto whitespace-pre-wrap" style={{ maxHeight: 'calc(70vh - 44px)' }}>{info}</div>
              </div>,
              document.body
            )}
          </>
        )}
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
            <button type="button" onClick={() => { onChange([]); }}
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
interface MapMunic { municipio: string; drs: string; rras: string; regiao_ad: string; regiao_sa: string; empenhado: number; liquidado: number; pago: number; pago_total: number; registros: number }
interface MapRegion { name: string; empenhado: number; liquidado: number; pago: number; pago_total: number; municipios: number; registros: number }
interface MapKpis { empenhado: number; liquidado: number; pago: number; pago_total: number; registros: number; municipios: number; drs_count: number }

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
  if (m) { const n = parseInt(m[1]); if (n >= 1 && n <= 18) return `RRAS ${String(n).padStart(2, '0')}`; }
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
      existing.pago += r.pago;
      existing.pago_total += r.pago_total;
      existing.municipios += r.municipios;
      existing.registros += r.registros;
    } else {
      map.set(key, { ...r, name: key });
    }
  }
  const sortAsc = (arr: MapRegion[]) => arr.sort((a, b) => {
    const na = parseInt(a.name.match(/(\d+)/)?.[1] ?? '9999');
    const nb = parseInt(b.name.match(/(\d+)/)?.[1] ?? '9999');
    return na !== nb ? na - nb : a.name.localeCompare(b.name, 'pt-BR');
  });
  return sortAsc(Array.from(map.values()));
}
function sortRegionsAsc(arr: MapRegion[]): MapRegion[] {
  return [...arr].sort((a, b) => {
    const na = parseInt(a.name.match(/(\d+)/)?.[1] ?? '9999');
    const nb = parseInt(b.name.match(/(\d+)/)?.[1] ?? '9999');
    return na !== nb ? na - nb : a.name.localeCompare(b.name, 'pt-BR');
  });
}
function makeRegionList(rows: Record<string, unknown>[], nameKey: string): MapRegion[] {
  const list = (rows ?? []).map(r => ({
    name: String(r[nameKey] ?? ''),
    empenhado: Number(r.empenhado ?? 0),
    liquidado: Number(r.liquidado ?? 0),
    pago: Number(r.pago ?? 0),
    pago_total: Number(r.pago_total ?? 0),
    municipios: Number(r.municipios ?? 0),
    registros: Number(r.registros ?? 0),
  })).filter(r => r.name);
  return sortRegionsAsc(list);
}

// Module-level caches (persist across tab switches)
const _mapDataCache: Record<string, { kpis: MapKpis; drsList: MapRegion[]; rrasList: MapRegion[]; regiaoAdList: MapRegion[]; regiaoSaList: MapRegion[]; allMunics: MapMunic[] }> = {};
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
  '#A3E4D7','#EDBB99','#C8A2C8',
];

function getDrsColor(name: string, idx: number): string {
  const m = name.match(/(\d+)/);
  if (m) { const n = parseInt(m[1]); if (n >= 1 && n <= DRS_PALETTE.length) return DRS_PALETTE[n - 1]; }
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
      <div className="bg-[#1B1B1B] rounded-2xl p-8 shadow-2xl border border-[#333] w-[360px] flex flex-col items-center gap-4 pointer-events-auto">
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
  const [municDetail, setMunicDetail] = useState<{ pago: number; projetos: { projeto: string; empenhado: number }[]; favorecidos: { favorecido: string; empenhado: number }[]; fontes: { fonte: string; empenhado: number }[]; elementos: { elemento: string; empenhado: number }[]; grupos: { grupo: string; empenhado: number }[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mapView, setMapView] = useState<'drs'|'rras'|'regiao_ad'|'regiao_sa'>('drs');
  const [rrasList, setRrasList] = useState<MapRegion[]>([]);
  const [regiaoAdList, setRegiaoAdList] = useState<MapRegion[]>([]);
  const [regiaoSaList, setRegiaoSaList] = useState<MapRegion[]>([]);

  // -- Lookups (memoized) --
  const activeRegionList = useMemo(() => { switch (mapView) { case 'rras': return rrasList; case 'regiao_ad': return regiaoAdList; case 'regiao_sa': return regiaoSaList; default: return drsList; } }, [mapView, drsList, rrasList, regiaoAdList, regiaoSaList]);
  const regionColorMap = useMemo(() => { const m: Record<string, string> = {}; activeRegionList.forEach((d, i) => { m[d.name] = getDrsColor(d.name, i); }); return m; }, [activeRegionList]);
  const municToRegion = useMemo(() => { const m: Record<string, string> = {}; allMunics.forEach(mu => { const val = mapView === 'drs' ? mu.drs : mapView === 'rras' ? mu.rras : mapView === 'regiao_ad' ? mu.regiao_ad : mu.regiao_sa; if (val) m[mu.municipio] = val; }); return m; }, [allMunics, mapView]);
  const municByName = useMemo(() => { const m: Record<string, MapMunic> = {}; allMunics.forEach(mu => { m[mu.municipio] = mu; }); return m; }, [allMunics]);
  // Detecta se a view atual tem dados por município (necessário para colorir o mapa)
  const hasMunicViewData = useMemo(() => {
    if (mapView === 'drs')       return allMunics.some(m => m.drs !== '');
    if (mapView === 'rras')      return allMunics.some(m => m.rras !== '');
    if (mapView === 'regiao_ad') return allMunics.some(m => m.regiao_ad !== '');
    return allMunics.some(m => m.regiao_sa !== '');
  }, [allMunics, mapView]);

  // -- Refs para lookup em runtime (evita closures obsoletas e permite reutilizar camadas) --
  const regionMapRef = useRef<Record<string, string>>({});
  const regionColorMapRef = useRef<Record<string, string>>({});
  const municByNameRef = useRef<Record<string, MapMunic>>({});
  const levelRef = useRef<'estado' | 'regiao'>('estado');
  useEffect(() => { regionMapRef.current = municToRegion; }, [municToRegion]);
  useEffect(() => { regionColorMapRef.current = regionColorMap; }, [regionColorMap]);
  useEffect(() => { municByNameRef.current = municByName; }, [municByName]);
  useEffect(() => { levelRef.current = level; }, [level]);

  // Função de estilo estável (lê dos refs — não muda de referência entre renders)
  const stateStyleFn = useCallback((feature: unknown): L.PathOptions => {
    const code = String((feature as { properties?: { codarea?: string } })?.properties?.codarea ?? '');
    const mName = _codeToName[code] || '';
    const rName = regionMapRef.current[mName] || '';
    const color = regionColorMapRef.current[rName] || '#e0e0e0';
    return { fillColor: color, fillOpacity: rName ? 0.6 : 0.15, color: '#888', weight: 0.6, opacity: 0.6 };
  }, []);

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

  // -- Load IBGE GeoJSON + Worker data --
  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const key = String(anoSel);
        // Fetch both in parallel
        const [geo, cached] = await Promise.all([
          fetchIBGE(),
          _mapDataCache[key] ? Promise.resolve(_mapDataCache[key]) : (async () => {
            const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'https://lc131-api.sessp-css2.workers.dev';
            const params: Record<string, unknown> = {};
            if (anoSel !== 'todos') params.p_ano = Number(anoSel);
            let d: Record<string, unknown>;
            // Fetch map data + dashboard in parallel (dashboard needed for pago kpi)
            const [mapRes, dashRes] = await Promise.all([
              fetch(`${WORKER_URL}/api/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'map_data', ...params }) }),
              fetch(`${WORKER_URL}/api/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dashboard', ...params }) }),
            ]);
            const [mapRpc, dashRpc2] = await Promise.all([mapRes.json(), dashRes.json()]);
            const mapErr = !mapRes.ok;
            const dashPago = Number((dashRpc2 as Record<string, unknown>)?.kpis != null
              ? ((dashRpc2 as Record<string, unknown>).kpis as Record<string, number>).pago ?? 0
              : 0);
            if (mapErr) {
              const dashRpc = dashRpc2;
              if (!dashRpc) throw new Error('Falha ao carregar dados do mapa');
              d = dashRpc as Record<string, unknown>;
              const dk = d.kpis as Record<string, number> ?? {};
              d = {
                kpis: { empenhado: dk.empenhado, liquidado: dk.liquidado, pago: dk.pago ?? 0, pago_total: dk.pago_total, registros: dk.total, municipios: dk.municipios, drs_count: ((d.por_drs as unknown[]) ?? []).length },
                por_drs: d.por_drs,
                municipios: ((d.por_municipio as Record<string, unknown>[] ?? [])).map(r => ({ ...r, drs: '', liquidado: 0, registros: 0 })),
              };
            } else { d = mapRpc as Record<string, unknown>; }
            const k = d.kpis as Record<string, number>;
            const dash = dashRpc2 as Record<string, unknown> ?? {};
            const mergedDrs = mergeDrsRegions((d.por_drs as Record<string, unknown>[] ?? []).map(r => ({ name: String(r.drs ?? ''), empenhado: Number(r.empenhado ?? 0), liquidado: Number(r.liquidado ?? 0), pago: Number(r.pago ?? 0), pago_total: Number(r.pago_total ?? 0), municipios: Number(r.municipios ?? 0), registros: Number(r.registros ?? 0) })));
            const rrasRows = (d.por_rras as Record<string, unknown>[] ?? []).length ? (d.por_rras as Record<string, unknown>[]) : (dash.por_rras as Record<string, unknown>[] ?? []);
            const rrasListData = makeRegionList(rrasRows, 'rras', normalizeRras);
            const regiaoAdRows = (d.por_regiao_ad as Record<string, unknown>[] ?? []).length ? (d.por_regiao_ad as Record<string, unknown>[]) : (dash.por_regiao_ad as Record<string, unknown>[] ?? []);
            const regiaoAdData = makeRegionList(regiaoAdRows, 'regiao_ad');
            const regiaoSaRows = (d.por_regiao_sa as Record<string, unknown>[] ?? []).length ? (d.por_regiao_sa as Record<string, unknown>[]) : (dash.por_regiao_sa as Record<string, unknown>[] ?? []);
            const regiaoSaData = makeRegionList(regiaoSaRows, 'regiao_sa');
            const result = {
              kpis: { empenhado: Number(k?.empenhado ?? 0), liquidado: Number(k?.liquidado ?? 0), pago: Number(k?.pago ?? dashPago), pago_total: Number(k?.pago_total ?? 0), registros: Number(k?.registros ?? 0), municipios: Number(k?.municipios ?? 0), drs_count: mergedDrs.length } as MapKpis,
              drsList: mergedDrs,
              rrasList: rrasListData,
              regiaoAdList: regiaoAdData,
              regiaoSaList: regiaoSaData,
              allMunics: (((d.por_municipio ?? d.municipios) as Record<string, unknown>[]) ?? []).map(r => ({
                municipio: String(r.municipio ?? ''), drs: normalizeDrs(String(r.drs ?? '')),
                rras: normalizeRras(String(r.rras ?? '')), regiao_ad: String(r.regiao_ad ?? ''), regiao_sa: String(r.regiao_sa ?? ''),
                empenhado: Number(r.empenhado ?? 0), liquidado: Number(r.liquidado ?? 0), pago: Number(r.pago ?? 0), pago_total: Number(r.pago_total ?? 0), registros: Number(r.registros ?? 0),
              })) as MapMunic[],
            };
            _mapDataCache[key] = result;
            return result;
          })(),
        ]);
        if (geo) setGeoLoaded(true);
        setKpis(cached.kpis); setDrsList(cached.drsList); setRrasList(cached.rrasList ?? []); setRegiaoAdList(cached.regiaoAdList ?? []); setRegiaoSaList(cached.regiaoSaList ?? []); setAllMunics(cached.allMunics);
      } catch (e: unknown) { setError((e as Error).message); }
      finally { setLoading(false); }
    })();
  }, [anoSel]);

  // -- Render map layers --
  const regionMap = municToRegion;
  const regionList = activeRegionList;

  useEffect(() => {
    const map = mapInst.current;
    if (!map) return;
    // Limpa labels e camada de destaque (sempre, independente de ter dados)
    if (hlLayerRef.current) { map.removeLayer(hlLayerRef.current); hlLayerRef.current = null; }
    labelsRef.current?.clearLayers();
    if (!activeRegionList.length) return;

    if (geoLoaded && _ibgeGeoJson) {
      if (level === 'estado') renderEstado(map);
      else if (level === 'regiao' && activeRegion) renderRegiao(map);
    } else {
      renderCircleFallback(map);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapView, drsList, rrasList, regiaoAdList, regiaoSaList, allMunics, geoLoaded, level, activeRegion]);

  function renderEstado(map: L.Map) {
    if (geoLayerRef.current) {
      // Caminho rápido: camada já existe → só atualiza estilos (sem recriar features)
      geoLayerRef.current.setStyle(stateStyleFn);
      if (!map.hasLayer(geoLayerRef.current)) geoLayerRef.current.addTo(map);
    } else {
      // Primeira vez: cria camada com handlers de evento
      geoLayerRef.current = L.geoJSON(_ibgeGeoJson, {
        style: stateStyleFn,
        onEachFeature: (feature, layer) => {
          const code = String(feature?.properties?.codarea ?? '');
          const mName = _codeToName[code] || '';
          // Tooltip dinâmico: lê dos refs no momento da exibição
          layer.bindTooltip(() => {
            const rName = regionMapRef.current[mName] || '';
            const mu = municByNameRef.current[mName];
            if (!rName) return '';
            return `<div style="min-width:160px"><strong>${mName}</strong><div style="color:#2563eb;font-size:10px">${rName}</div>${mu ? `<div style="margin-top:3px;font-size:11px">Emp: <strong>${fmt(mu.empenhado, 'currency')}</strong></div>` : ''}</div>`;
          }, { className: 'map-tooltip-dark', direction: 'top' });
          layer.on({
            mouseover: (e: L.LeafletMouseEvent) => {
              if (levelRef.current !== 'estado') return;
              const t = e.target as L.Path;
              t.setStyle({ fillOpacity: 0.85, weight: 2.5, color: '#fff' }); t.bringToFront();
            },
            mouseout: (e: L.LeafletMouseEvent) => {
              if (levelRef.current !== 'estado') return;
              geoLayerRef.current?.resetStyle(e.target);
            },
            click: () => {
              if (levelRef.current !== 'estado') return;
              const mu = municByNameRef.current[mName];
              if (mu) { selectMunicipality(mu); return; }
              const rName = regionMapRef.current[mName] || '';
              if (rName) drillIntoRegion(rName);
            },
          });
        },
      }).addTo(map);
    }
    // Labels das regiões — deduplica por coordenada (evita 2 labels sobrepostos)
    const usedCoords = new Set<string>();
    // Ordena por empenhado desc para que o maior apareça quando há conflito de coordenada
    const sortedRegions = [...regionList].sort((a, b) => b.empenhado - a.empenhado);
    sortedRegions.forEach(reg => {
      const c = findRegionCoord(reg.name);
      if (!c) return;
      const coordKey = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`;
      if (usedCoords.has(coordKey)) return;  // pula duplicata
      usedCoords.add(coordKey);
      const icon = L.divIcon({
        className: 'drs-label',
        html: `<div class="drs-label-inner drs-label-clickable"><strong>${reg.name.replace(/^DRS\s*/i, '').replace(/^\d+\s*-\s*/, '').trim() || reg.name}</strong><span>${fmt(reg.empenhado, 'currency')}</span></div>`,
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
    // Fundo: reutiliza camada existente (setStyle) ou cria nova dim
    const dimStyle = () => ({ fillColor: '#d0d0d0', fillOpacity: 0.3, color: '#aaa', weight: 0.3 });
    if (geoLayerRef.current) {
      geoLayerRef.current.setStyle(dimStyle);
      if (!map.hasLayer(geoLayerRef.current)) geoLayerRef.current.addTo(map);
    } else {
      geoLayerRef.current = L.geoJSON(_ibgeGeoJson, { style: dimStyle }).addTo(map);
    }
    // Foreground: highlighted region
    const rc = regionColorMap[activeRegion] || '#118DFF';
    hlLayerRef.current = L.geoJSON({ type: 'FeatureCollection', features: filteredFeatures }, {
      style: (feature) => {
        const code = String(feature?.properties?.codarea ?? '');
        const mName = _codeToName[code] || '';
        const mu = municByName[mName];
        const color = mu ? execPct(mu.empenhado, mu.liquidado) : rc;
        return { fillColor: color, fillOpacity: 0.7, color: '#fff', weight: 1.5, opacity: 1 };
      },
      onEachFeature: (feature, layer) => {
        const code = String(feature?.properties?.codarea ?? '');
        const mName = _codeToName[code] || '';
        const mu = municByName[mName];
        const pct = mu && mu.empenhado > 0 ? ((mu.liquidado / mu.empenhado) * 100).toFixed(1) : '0';
        layer.bindTooltip(
          `<div style="min-width:200px"><strong style="font-size:13px">${mName}</strong><br/><div style="margin-top:4px;display:grid;grid-template-columns:1fr auto;gap:3px 12px">
            <span style="color:#2563eb">Empenhado:</span><strong>${mu ? fmt(mu.empenhado, 'currency') : ' -'}</strong>
            <span style="color:#16a34a">Liquidado:</span><strong>${mu ? fmt(mu.liquidado, 'currency') : ' -'}</strong>
            <span style="color:#ea580c">Pago Total:</span><strong>${mu ? fmt(mu.pago_total, 'currency') : ' -'}</strong>
            <span style="color:#555">% Liquidado:</span><strong>${pct}%</strong></div></div>`,

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
      const color = execPct(reg.empenhado, reg.liquidado);
      L.circleMarker([c.lat, c.lng], { radius, fillColor: color, color: '#fff', weight: 2, opacity: 0.9, fillOpacity: 0.7 })
        .bindTooltip(`<strong>${reg.name}</strong><br/>Emp: ${fmt(reg.empenhado, 'currency')}`, { className: 'map-tooltip-dark', direction: 'top' })
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
    const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'https://lc131-api.sessp-css2.workers.dev';
    setDetailLoading(true);
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 8000);
    try {
      const body: Record<string, unknown> = { action: 'munic_detail', p_municipio: mun };
      if (anoSel !== 'todos') body.p_ano = Number(anoSel);
      const res = await fetch(`${WORKER_URL}/api/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (!res.ok) return;
      const d = await res.json() as Record<string, unknown>;
      if (!d || d.error) return;
      setMunicDetail({
        pago:        Number((d.pago as number) ?? 0),
        projetos:    (d.projetos as { projeto: string; empenhado: number }[] ?? []),
        favorecidos: (d.favorecidos as { favorecido: string; empenhado: number }[] ?? []),
        fontes:      (d.fontes as { fonte: string; empenhado: number }[] ?? []),
        elementos:   (d.elementos as { elemento: string; empenhado: number }[] ?? []),
        grupos:      (d.grupos as { grupo: string; empenhado: number }[] ?? []),
      });
    } catch { clearTimeout(tid); /* silent: timeout ou erro de rede */ }
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

  const currentRegion = activeRegion ? activeRegionList.find(d => d.name === activeRegion) : null;
  const currentMunics = activeRegion ? allMunics.filter(m => municToRegion[m.municipio] === activeRegion).sort((a, b) => b.empenhado - a.empenhado) : [];
  const mapViewLabel = mapView === 'drs' ? 'DRS' : mapView === 'rras' ? 'RRAS' : mapView === 'regiao_ad' ? 'Reg. Admin.' : 'Reg. Saúde';
  const mapViewFilterKey = mapView === 'drs' ? 'p_drs' : mapView === 'rras' ? 'p_rras' : mapView === 'regiao_ad' ? 'p_regiao_ad' : 'p_regiao_sa';

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
          <p className="text-red-300 text-[10px] mt-2">Entre em contato com o administrador do sistema.</p>
        </div>
      )}

      {/* SQL-not-applied warning for regiao_ad / regiao_sa */}
      {!loading && !error && !hasMunicViewData && activeRegionList.length > 0 && level === 'estado' && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000] bg-[#1B1B1B]/95 backdrop-blur border border-[#F59E0B] text-[#F59E0B] px-5 py-3 rounded-xl text-xs shadow-2xl max-w-md text-center pointer-events-none">
          <p className="font-bold text-sm mb-1">⚠ Cores por {mapViewLabel} indisponíveis</p>
          <p className="text-[#FCD34D]">Dados de coloração por {mapViewLabel} não disponíveis para o período selecionado. Selecione um ano específico.</p>
          <p className="text-[#888] mt-1 text-[10px]">A lista de regiões na legenda já está disponível.</p>
        </div>
      )}

      {/* Breadcrumb + toggle */}
      <div className="absolute top-4 left-4 z-[1000] flex items-center gap-2 flex-wrap">
        {/* View selector */}
        <div className="flex items-center gap-0.5 bg-[#1B1B1B]/90 backdrop-blur px-1.5 py-1 rounded-xl shadow-lg border border-[#333]">
          {([['drs','DRS'],['rras','RRAS'],['regiao_ad','Reg. Admin.'],['regiao_sa','Reg. Saúde']] as [string,string][]).map(([k, lb]) => (
            <button key={k} onClick={() => { setMapView(k as 'drs'|'rras'|'regiao_ad'|'regiao_sa'); if (level !== 'estado') { setLevel('estado'); setActiveRegion(null); setActiveMunic(null); setMunicDetail(null); setSidebarOpen(false); } }}
              className={cn('px-2.5 py-1 rounded-lg text-[10px] font-bold transition whitespace-nowrap', mapView === k ? 'bg-[#118DFF] text-white' : 'text-[#888] hover:text-white hover:bg-[#333]')}>
              {lb}
            </button>
          ))}
        </div>
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
            <p className="text-[9px] text-[#888] uppercase font-bold">Pago</p>
            <p className="text-lg font-bold text-[#FFD580]">{fmt(kpis.pago, 'currency')}</p>
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
                {activeMunic
                  ? `${[activeMunic.drs, activeMunic.rras, activeMunic.regiao_ad, activeMunic.regiao_sa].filter(Boolean).join(' · ')} · ${activeMunic.registros} registros`
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
              <div className="space-y-3">
                {/* Tags de classificação */}
                <div className="flex flex-wrap gap-1.5">
                  {([['DRS', activeMunic.drs], ['RRAS', activeMunic.rras], ['Reg. Admin.', activeMunic.regiao_ad], ['Reg. Saúde', activeMunic.regiao_sa]] as [string,string][]).filter(([,v]) => v).map(([lbl, val]) => (
                    <span key={lbl} className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#222] border border-[#2a2a2a]">
                      <span className="text-[#555]">{lbl}:</span> <span className="text-[#AAA]">{val}</span>
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <MiniKpi label="Empenhado" value={fmt(activeMunic.empenhado, 'currency')} color="#89CFF0" />
                  <MiniKpi label="Liquidado" value={fmt(activeMunic.liquidado, 'currency')} color="#90EE90" />
                  <MiniKpi label="Pago" value={municDetail ? fmt(municDetail.pago, 'currency') : fmt(activeMunic.pago, 'currency')} color="#FFD580" />
                  <MiniKpi label="Pago Total" value={fmt(activeMunic.pago_total, 'currency')} color="#FFB347" />
                  <MiniKpi label="% Liq." value={(activeMunic.empenhado > 0 ? (activeMunic.liquidado / activeMunic.empenhado * 100).toFixed(1) : '0') + '%'} color={execPct(activeMunic.empenhado, activeMunic.liquidado)} />
                  <MiniKpi label="% Exec." value={(activeMunic.empenhado > 0 ? (activeMunic.pago_total / activeMunic.empenhado * 100).toFixed(1) : '0') + '%'} color={execPct(activeMunic.empenhado, activeMunic.pago_total)} />
                </div>
              </div>
            ) : currentRegion ? (
              <div className="grid grid-cols-2 gap-2">
                <MiniKpi label="Empenhado" value={fmt(currentRegion.empenhado, 'currency')} color="#89CFF0" />
                <MiniKpi label="Liquidado" value={fmt(currentRegion.liquidado, 'currency')} color="#90EE90" />
                <MiniKpi label="Pago" value={fmt(currentRegion.pago, 'currency')} color="#FFD580" />
                <MiniKpi label="Pago Total" value={fmt(currentRegion.pago_total, 'currency')} color="#FFB347" />
                <MiniKpi label="% Liq." value={(currentRegion.empenhado > 0 ? (currentRegion.liquidado / currentRegion.empenhado * 100).toFixed(1) : '0') + '%'} color={execPct(currentRegion.empenhado, currentRegion.liquidado)} />
                <MiniKpi label="% Exec." value={(currentRegion.empenhado > 0 ? (currentRegion.pago_total / currentRegion.empenhado * 100).toFixed(1) : '0') + '%'} color={execPct(currentRegion.empenhado, currentRegion.pago_total)} />
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
                        <span className="relative w-2 h-2 rounded-full shrink-0" style={{ background: execPct(m.empenhado, m.liquidado) }} />
                        <span className="relative text-white text-[11px] truncate flex-1">{m.municipio}</span>
                        <span className="relative text-[#89CFF0] text-[11px] font-mono font-bold shrink-0">{fmt(m.empenhado, 'currency')}</span>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => onNavigate({ [mapViewFilterKey]: [activeRegion!] }, 'regional')}
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
                      {municDetail.projetos.map((p, i) => <DetailItem key={i} label={stripNumPrefix(p.projeto)} value={fmt(p.empenhado, 'currency')} />)}
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
                      {municDetail.grupos.map((g, i) => <DetailItem key={i} label={stripNumPrefix(g.grupo)} value={fmt(g.empenhado, 'currency')} />)}
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
          <p className="text-[9px] text-[#888] uppercase font-bold mb-2 tracking-wider">% Liquidado (Liq/Emp)</p>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#1AAB40]" /><span className="text-[11px] text-[#CCC]">≥ 80%</span></div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#D9B300]" /><span className="text-[11px] text-[#CCC]">50–80%</span></div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#D64550]" /><span className="text-[11px] text-[#CCC]">{'< 50%'}</span></div>
          </div>
          {level === 'estado' && activeRegionList.length > 0 && (
            <>
              <div className="border-t border-[#333] my-2.5" />
              <p className="text-[9px] text-[#888] uppercase font-bold mb-2 tracking-wider">{mapViewLabel} (clique para detalhar)</p>
              <div className="flex flex-col gap-0.5 max-h-[280px] overflow-y-auto custom-scrollbar">
                {activeRegionList.map((d, i) => (
                  <button key={i} onClick={() => drillIntoRegion(d.name)}
                    className="flex items-center gap-2 hover:bg-[#333] rounded-lg px-2 py-1 transition text-left">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: regionColorMap[d.name] || '#999' }} />
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

// --- Upload OB Panel ---
function UploadObPanel({ onClose, onImportDone }: { onClose: () => void; onImportDone?: (count: number) => void }) {
  const [step, setStep] = useState<UploadStep>('idle');
  const [rows, setRows] = useState<DataRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [inserted, setInserted] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const WORKER_URL   = import.meta.env.VITE_WORKER_URL   ?? 'https://lc131-api.sessp-css2.workers.dev';
  const IMPORT_TOKEN = import.meta.env.VITE_IMPORT_TOKEN ?? '';

  // Mapeamento: cabeçalho xlsx (normalizado) → coluna D1
  // Nota: "Nº" normaliza para "n" (º = U+00BA não é diacrítico), por isso variantes
  // como "n_processo", "n_do_processo" e "numero_do_processo" são necessárias.
  const OB_COL_MAP: Record<string, string> = {
    // ano
    'ano_referencia':              'ano_referencia',
    'ano':                         'ano_referencia',
    'ano_referencia_pagamento':    'ano_referencia',
    // mes
    'mes_lancamento':              'mes_lancamento',
    'mes':                         'mes_lancamento',
    // credor
    'codigo_nome_credor':          'codigo_nome_credor',
    'credor':                      'codigo_nome_credor',
    'nome_credor':                 'codigo_nome_credor',
    'favorecido':                  'codigo_nome_credor',
    // data
    'data_lancamento':             'data_lancamento',
    'data':                        'data_lancamento',
    // numero_documento — "Nº Documento" → "n_documento"
    'numero_documento':            'numero_documento',
    'n_documento':                 'numero_documento',
    'n_do_documento':              'numero_documento',
    'num_documento':               'numero_documento',
    'nro_documento':               'numero_documento',
    'numero_do_documento':         'numero_documento',
    // valor
    'valor_documento':             'valor_documento',
    'valor':                       'valor_documento',
    // ug
    'codigo_nome_ug_responsavel':  'codigo_nome_ug',
    'codigo_nome_ug':              'codigo_nome_ug',
    'ug':                          'codigo_nome_ug',
    // uo
    'codigo_uo_responsavel':       'codigo_uo',
    'codigo_uo':                   'codigo_uo',
    'uo':                          'codigo_uo',
    // descricao
    'descricao_documento':         'descricao_documento',
    'descricao':                   'descricao_documento',
    // orgao
    'codigo_nome_orgao_responsavel':'codigo_nome_orgao',
    'codigo_nome_orgao':           'codigo_nome_orgao',
    'orgao':                       'codigo_nome_orgao',
    // doc origem
    'numero_documento_origem':     'numero_documento_origem',
    'n_documento_origem':          'numero_documento_origem',
    'doc_origem':                  'numero_documento_origem',
    'doc_de_origem':               'numero_documento_origem',
    // ne
    'ne_origem':                   'ne_origem',
    'ne':                          'ne_origem',
    // fonte
    'codigo_nome_fonte_recurso':   'codigo_nome_fonte_recurso',
    'fonte_recurso':               'codigo_nome_fonte_recurso',
    'fonte':                       'codigo_nome_fonte_recurso',
    // programa
    'codigo_nome_programa_trabalho':'codigo_nome_programa',
    'codigo_nome_programa':        'codigo_nome_programa',
    'programa':                    'codigo_nome_programa',
    // elemento
    'codigo_nome_elemento':        'codigo_nome_elemento',
    'elemento':                    'codigo_nome_elemento',
    // numero_processo — "Nº Processo" (col Q) → normaliza para "n_processo"
    'numero_processo':             'numero_processo',
    'n_processo':                  'numero_processo',
    'n_do_processo':               'numero_processo',
    'numero_do_processo':          'numero_processo',
    'numero_de_processo':          'numero_processo',
    'num_processo':                'numero_processo',
    'num_do_processo':             'numero_processo',
    'nro_processo':                'numero_processo',
    'no_processo':                 'numero_processo',
  };

  const normHeader = (h: string) =>
    h.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/__+/g, '_').replace(/^_+|_+$/g, '');

  // Converte serial Excel → "DD/MM/YYYY"
  const excelSerial = (v: unknown): string | null => {
    if (!v) return null;
    if (typeof v === 'string' && v.includes('/')) return v;
    const n = Number(v);
    if (!n || isNaN(n)) return typeof v === 'string' ? v : null;
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
  };

  const handleFile = async (file: File) => {
    setFileName(file.name); setStep('parsing');
    try {
      if (!file.name.match(/\.(xlsx|xls)$/i)) throw new Error('Apenas arquivos .xlsx são suportados para OB.');
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      // Localiza header: primeira linha a partir de index 2 com >= 5 células texto
      let hIdx = 3;
      for (let i = 2; i < Math.min(8, matrix.length); i++) {
        const row = matrix[i] as unknown[];
        const texts = row.filter(v => typeof v === 'string' && v.trim().length > 2);
        if (texts.length >= 5) { hIdx = i; break; }
      }

      const rawHeaders = (matrix[hIdx] as unknown[]).map(h => normHeader(String(h ?? '')));
      const colMap: Record<number, string> = {};
      rawHeaders.forEach((h, i) => {
        const d1Col = OB_COL_MAP[h];
        if (d1Col) colMap[i] = d1Col;
      });

      const mapped = Object.values(colMap);
      if (mapped.length < 4) throw new Error(`Colunas não reconhecidas. Detectadas: ${rawHeaders.filter(Boolean).slice(0, 5).join(', ')}`);

      const SKIP = ['total geral','total','subtotal'];
      const parsed: DataRow[] = [];
      for (let i = hIdx + 1; i < matrix.length; i++) {
        const arr = matrix[i] as unknown[];
        if (arr.every(v => v === '' || v == null)) continue;
        const first = String(arr[0] ?? '').toLowerCase().trim();
        if (SKIP.some(s => first.startsWith(s))) continue;
        const row: DataRow = {};
        for (const [idx, d1Col] of Object.entries(colMap)) {
          const j = Number(idx);
          let v: unknown = arr[j] ?? null;
          if (d1Col === 'data_lancamento') v = excelSerial(v);
          else if (d1Col === 'ano_referencia') v = parseInt(String(v)) || null;
          else if (d1Col === 'valor_documento') v = parseFloat(String(v)) || 0;
          else v = (v === '' || v == null) ? null : String(v).trim();
          row[d1Col] = v;
        }
        if (!row.numero_documento && !row.ano_referencia) continue;
        parsed.push(row);
      }
      if (!parsed.length) throw new Error('Nenhum registro encontrado.');
      setRows(parsed); setStep('preview');
    } catch (e: unknown) { setMessage((e as Error).message); setStep('error'); }
  };

  const handleUpload = async () => {
    setStep('uploading'); setProgress(0);
    const CHUNK = 500;
    let totalInserted = 0;
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const batch = rows.slice(i, i + CHUNK);
        const res = await fetch(`${WORKER_URL}/api/import-ob`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: IMPORT_TOKEN, rows: batch }),
        });
        const data = await res.json() as { ok?: boolean; inserted?: number; error?: string };
        if (!data.ok) throw new Error(data.error ?? 'Erro no servidor');
        totalInserted += data.inserted ?? 0;
        setProgress(Math.round(((i + batch.length) / rows.length) * 100));
      }
      setInserted(totalInserted);
      setMessage(`${totalInserted.toLocaleString('pt-BR')} OBs inseridas (${rows.length.toLocaleString('pt-BR')} no arquivo).`);
      setStep('done');
      onImportDone?.(totalInserted);
    } catch (e: unknown) { setMessage((e as Error).message); setStep('error'); }
  };

  const reset = () => { setStep('idle'); setRows([]); setFileName(''); setProgress(0); setMessage(''); setInserted(0); };

  return (
    <div className="fixed inset-0 z-[10000] flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-lg h-full bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E5E5E5] flex items-center justify-between bg-[#FAFAFA]">
          <div className="flex items-center gap-2.5">
            <DollarSign className="w-4 h-4 text-[#E66C37]" />
            <div>
              <p className="font-bold text-[#333] text-sm">Importar OB (Ordens Bancárias)</p>
              <p className="text-[10px] text-[#999]">Lis OB – Entidades e municípios · 2022-2025</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#E5E5E5]">
            <X className="w-4 h-4 text-[#666]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Info banner */}
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="font-bold mb-0.5">Arquivo esperado</p>
              <p className="text-[11px] leading-relaxed">
                <span className="font-mono">Lis OB - Entidades e municipios.xlsx</span> — cabeçalho na linha 4, colunas:
                Ano, Mês, Credor, Data, Nº Documento, Valor, UG, UO, Descrição, Órgão, Doc. Origem, NE, Fonte, Programa, Elemento, Nº Processo.
              </p>
              <p className="mt-1 text-[11px]">Os OBs são vinculados a LC 131 via <strong>Número de Processo</strong>.</p>
            </div>
          </div>

          {step === 'idle' && (
            <div onDrop={e => { e.preventDefault(); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]); }}
              onDragOver={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
              className="bg-[#FFF8F5] border-2 border-dashed border-[#E66C37]/30 rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-[#E66C37] transition group">
              <FileSpreadsheet className="w-10 h-10 text-[#E66C37]/40 group-hover:text-[#E66C37]" />
              <div className="text-center">
                <p className="font-semibold text-[#333]">Arraste ou clique para selecionar</p>
                <p className="text-xs text-[#999] mt-1">Lis OB .xlsx</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </div>
          )}

          {step === 'parsing' && (
            <div className="flex flex-col items-center gap-3 py-10"><Spinner size={7} /><p className="text-sm text-[#666]">Lendo planilha...</p></div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <div className="bg-[#F8FBFF] border border-[#D0E8FF] rounded-lg px-4 py-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-[#666]">Arquivo</span><span className="font-mono font-bold text-[#333] truncate max-w-[60%]">{fileName}</span></div>
                <div className="flex justify-between"><span className="text-[#666]">Registros lidos</span><span className="font-bold text-[#118DFF]">{rows.length.toLocaleString('pt-BR')}</span></div>
                <div className="flex justify-between"><span className="text-[#666]">Anos detectados</span>
                  <span className="font-bold text-[#333]">{[...new Set(rows.map(r => r.ano_referencia as number).filter(Boolean))].sort().join(', ')}</span>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={reset} className="flex-1 py-2 text-sm font-semibold text-[#666] border border-[#D0D0D0] rounded-lg hover:bg-[#FAFAFA]">Cancelar</button>
                <button onClick={handleUpload} className="flex-1 py-2 text-sm font-bold bg-[#E66C37] text-white rounded-lg hover:bg-[#D05A25]">
                  Importar {rows.length.toLocaleString('pt-BR')} OBs
                </button>
              </div>
            </div>
          )}

          {step === 'uploading' && (
            <div className="space-y-3 py-6">
              <div className="flex items-center gap-2 justify-center"><Spinner size={5} /><p className="text-sm text-[#666]">Enviando... {progress}%</p></div>
              <div className="h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                <div className="h-full bg-[#E66C37] rounded-full transition-all duration-300" style={{ width: progress + '%' }} />
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <div>
                <p className="font-bold text-[#333]">OBs importadas com sucesso!</p>
                <p className="text-sm text-[#666] mt-1">{message}</p>
                {inserted > 0 && <p className="text-xs text-[#999] mt-1">Acesse a aba <strong>OB</strong> para ver os dados e relacionamentos com a LC 131.</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={reset} className="px-4 py-2 border border-[#E66C37] text-[#E66C37] text-sm font-bold rounded-lg hover:bg-[#FFF8F5]">Importar outro</button>
                <button onClick={onClose} className="px-4 py-2 bg-[#E66C37] text-white text-sm font-bold rounded-lg">Fechar</button>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertCircle className="w-10 h-10 text-red-300" />
              <div><p className="font-bold text-red-700">Erro na importação</p><p className="text-xs text-red-500 mt-1 font-mono break-all">{message}</p></div>
              <button onClick={reset} className="px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-lg">Tentar novamente</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Upload Panel ---
function UploadPanel({ onClose, onImportDone }: { onClose: () => void; onImportDone?: () => void }) {
  const [step, setStep] = useState<UploadStep>('idle');
  const [lcRows, setLcRows] = useState<DataRow[]>([]);
  const [obRows, setObRows] = useState<DataRow[]>([]);
  const [lcFileName, setLcFileName] = useState('');
  const [obFileName, setObFileName] = useState('');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [dbCount, setDbCount] = useState<number | null>(null);
  const [procSteps, setProcSteps] = useState<{label:string; status:'wait'|'running'|'ok'|'warn'}[]>([]);
  const [procProgress, setProcProgress] = useState(0);
  const lcFileRef = useRef<HTMLInputElement>(null);
  const obFileRef = useRef<HTMLInputElement>(null);

  const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'https://lc131-api.sessp-css2.workers.dev';
  const IMPORT_TOKEN = import.meta.env.VITE_IMPORT_TOKEN ?? '';

  const hasImportShape = (sample: DataRow) => {
    const cols = new Set(Object.keys(sample || {}));
    const hasAnoRef = cols.has('ano_referencia');
    const hasConsolidatedAno = cols.has('ano');
    const hasPagoTotalOnly = cols.has('pago_total')
      && !cols.has('empenhado')
      && !cols.has('liquidado')
      && !cols.has('pago')
      && !cols.has('pago_anos_anteriores');
    return { hasAnoRef, hasConsolidatedAno, hasPagoTotalOnly };
  };

  const OB_COL_MAP: Record<string, string> = {
    ano_referencia: 'ano_referencia', ano: 'ano_referencia', ano_referencia_pagamento: 'ano_referencia',
    mes_lancamento: 'mes_lancamento', mes: 'mes_lancamento',
    codigo_nome_credor: 'codigo_nome_credor', credor: 'codigo_nome_credor', nome_credor: 'codigo_nome_credor', favorecido: 'codigo_nome_credor',
    data_lancamento: 'data_lancamento', data: 'data_lancamento',
    numero_documento: 'numero_documento', n_documento: 'numero_documento', n_do_documento: 'numero_documento', num_documento: 'numero_documento', nro_documento: 'numero_documento', numero_do_documento: 'numero_documento',
    valor_documento: 'valor_documento', valor: 'valor_documento',
    codigo_nome_ug_responsavel: 'codigo_nome_ug', codigo_nome_ug: 'codigo_nome_ug', ug: 'codigo_nome_ug',
    codigo_uo_responsavel: 'codigo_uo', codigo_uo: 'codigo_uo', uo: 'codigo_uo',
    descricao_documento: 'descricao_documento', descricao: 'descricao_documento',
    codigo_nome_orgao_responsavel: 'codigo_nome_orgao', codigo_nome_orgao: 'codigo_nome_orgao', orgao: 'codigo_nome_orgao',
    numero_documento_origem: 'numero_documento_origem', n_documento_origem: 'numero_documento_origem', doc_origem: 'numero_documento_origem', doc_de_origem: 'numero_documento_origem',
    ne_origem: 'ne_origem', ne: 'ne_origem',
    codigo_nome_fonte_recurso: 'codigo_nome_fonte_recurso', fonte_recurso: 'codigo_nome_fonte_recurso', fonte: 'codigo_nome_fonte_recurso',
    codigo_nome_programa_trabalho: 'codigo_nome_programa', codigo_nome_programa: 'codigo_nome_programa', programa: 'codigo_nome_programa',
    codigo_nome_elemento: 'codigo_nome_elemento', elemento: 'codigo_nome_elemento',
    numero_processo: 'numero_processo', n_processo: 'numero_processo', n_do_processo: 'numero_processo', numero_do_processo: 'numero_processo', numero_de_processo: 'numero_processo', num_processo: 'numero_processo', num_do_processo: 'numero_processo', nro_processo: 'numero_processo', no_processo: 'numero_processo',
  };

  const normHeader = (h: string) =>
    h.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/__+/g, '_').replace(/^_+|_+$/g, '');

  const excelSerial = (v: unknown): string | null => {
    if (!v) return null;
    if (typeof v === 'string' && v.includes('/')) return v;
    const n = Number(v);
    if (!n || isNaN(n)) return typeof v === 'string' ? v : null;
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
  };

  useEffect(() => {
    fetch(`${WORKER_URL}/health`)
      .then(r => r.json())
      .then((d: unknown) => setDbCount((d as { rows: number }).rows ?? 0))
      .catch(() => setDbCount(0));
  }, [WORKER_URL]);

  // ── Mapeamento de colunas XLSX → D1 ──────────────────────────────────────
  // Cobre variantes comuns de headers do SIAFEM/SIGEO, incluindo abreviações
  // como "Nº" (normaliza para "n") e preposições ("do", "de", "da").
  const D1_ALIASES: Record<string, string> = {
    nome_municipio:           'municipio',
    codigo_fonte_recursos:    'fonte_recurso',
    // numero_processo — col O no LC 131: "Número do Processo" → "numero_do_processo"
    numero_do_processo:       'numero_processo',
    numero_de_processo:       'numero_processo',
    n_processo:               'numero_processo',
    n_do_processo:            'numero_processo',
    num_processo:             'numero_processo',
    num_do_processo:          'numero_processo',
    nro_processo:             'numero_processo',
    no_processo:              'numero_processo',
    // descricao_processo — variantes
    descricao_do_processo:    'descricao_processo',
    descricao_de_processo:    'descricao_processo',
  };

  // Lookup tables (geradas de tab_municipios_rows.csv e despesas.csv)
  const MUNICIPIOS_REF = (MUNICIPIOS_LOOKUP as { lookup: Record<string, { drs: string; regiao_ad: string; rras: string; regiao_sa: string; cod_ibge: string }> }).lookup;
  const TIPO_BY_ELEM   = (DESPESAS_LOOKUPS as { tipo_by_element: Record<string, string> }).tipo_by_element;
  const FONTE_BY_CODE  = (DESPESAS_LOOKUPS as { fonte_by_code: Record<string, string> }).fonte_by_code;

  // Lookup composto: UO5, UO5+proj4, proj4, proj4+elem6, elem6+proj4, elem6
  const TL = TIPO_LOOKUP as {
    by_uo5: Record<string, string>;
    by_uo5_proj4: Record<string, string>;
    by_proj4: Record<string, string>;
    by_proj4_elem6: Record<string, string>;
    by_elem_proj: Record<string, string>;
    by_elem6: Record<string, string>;
    [k: string]: unknown;
  };

  function resolveTipo(
    uo: string | null | undefined,
    proj: string | null | undefined,
    elem: string | null | undefined,
  ): string {
    const uo5   = String(uo   ?? '').substring(0, 5);
    const p4    = String(proj ?? '').substring(0, 4);
    const e6    = String(elem ?? '').replace(/\D.*/, '').substring(0, 6);
    const e3    = e6.substring(0, 3);
    // Projeto 9001-9020 → Intraorçamentária
    const pNum  = parseInt(p4, 10);
    if (pNum >= 9001 && pNum <= 9020) return 'INTRAORÇAMENTÁRIA';
    // 1. UO+proj
    if (uo5 && p4) { const r = TL.by_uo5_proj4[`${uo5}|${p4}`]; if (r) return r; }
    // 2. UO sozinha
    if (uo5)       { const r = TL.by_uo5[uo5];                   if (r) return r; }
    // 3. Proj+elem
    if (p4 && e6)  { const r = TL.by_proj4_elem6[`${p4}|${e6}`]; if (r) return r; }
    // 4. Proj sozinho (programas singulares)
    if (p4)        { const r = TL.by_proj4[p4];                   if (r) return r; }
    // 5. Elem+proj (composite do CSV)
    if (e6 && p4)  { const r = TL.by_elem_proj[`${e6}|${p4}`];   if (r) return r; }
    // 6. Elem6 (dominante do CSV)
    if (e6)        { const r = TL.by_elem6[e6] ?? TIPO_BY_ELEM[e6]; if (r) return r; }
    // 7. Elem3 prefixo
    const TIPO_PREFIX: Record<string, string> = {
      '319': 'UNIDADE PRÓPRIA', '329': 'DIVIDA EXTERNA E INTERNA',
      '334': 'TRANSFERÊNCIA VOLUNTÁRIA', '335': 'TRANSFERÊNCIA VOLUNTÁRIA',
      '336': 'TRANSFERÊNCIA VOLUNTÁRIA', '337': 'TRANSFERÊNCIA VOLUNTÁRIA',
      '338': 'UNIDADE PRÓPRIA', '339': 'UNIDADE PRÓPRIA',
      '444': 'TRANSFERÊNCIA VOLUNTÁRIA', '445': 'TRANSFERÊNCIA VOLUNTÁRIA',
      '447': 'TRANSFERÊNCIA VOLUNTÁRIA', '449': 'UNIDADE PRÓPRIA',
      '469': 'DIVIDA EXTERNA E INTERNA',
    };
    return TIPO_PREFIX[e3] ?? 'UNIDADE PRÓPRIA';
  }

  const enrichForD1 = (inputRows: DataRow[]): DataRow[] =>
    inputRows.map(r => {
      const out = { ...r };

      // 1. Rename colunas XLSX → D1
      for (const [from, to] of Object.entries(D1_ALIASES)) {
        if (from in out) {
          if (out[to] == null || out[to] === '') out[to] = out[from];
          delete out[from];
        }
      }

      // 2. DRS/RRAS via lookup estático (tab_municipios_rows.csv)
      if (!out.drs && out.municipio) {
        const munKey = String(out.municipio).toUpperCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const ref = MUNICIPIOS_REF[munKey];
        if (ref) {
          out.drs       = ref.drs;
          out.regiao_ad = ref.regiao_ad;
          out.rras      = ref.rras;
          out.regiao_sa = ref.regiao_sa;
          out.cod_ibge  = ref.cod_ibge;
        }
      }

      // 3. grupo_despesa → categoria de negócio (PESSOAL/CUSTEIO/INVESTIMENTO/DIVIDA)
      const validGrupos = ['PESSOAL', 'CUSTEIO', 'INVESTIMENTO', 'DIVIDA'];
      if (!out.grupo_despesa || !validGrupos.includes(String(out.grupo_despesa))) {
        const prefix = String(out.codigo_nome_grupo ?? '').match(/^(\d{2})/)?.[1] ?? '';
        const GRUPO_PREFIX: Record<string, string> = {
          '31': 'PESSOAL', '32': 'DIVIDA', '33': 'CUSTEIO',
          '44': 'INVESTIMENTO', '45': 'INVESTIMENTO', '46': 'DIVIDA', '47': 'DIVIDA',
        };
        out.grupo_despesa = GRUPO_PREFIX[prefix] ?? 'CUSTEIO';
      }

      // 4. grupo_simpl (derivado do grupo_despesa)
      if (!out.grupo_simpl) {
        const g = String(out.grupo_despesa ?? '');
        if      (g === 'PESSOAL')     out.grupo_simpl = 'Pessoal';
        else if (g === 'INVESTIMENTO') out.grupo_simpl = 'Investimentos';
        else if (g === 'DIVIDA')      out.grupo_simpl = 'Juros/Dívida';
        else                          out.grupo_simpl = 'Custeio';
      }

      // 5. tipo_despesa — hierarquia: UO → Projeto+Elem → Elemento (via resolveTipo)
      const wrongTipos = ['PESSOAL', 'CUSTEIO', 'INVESTIMENTO', 'DIVIDA',
                          'OUTRAS DESPESAS CORRENTES', 'PESSOAL E ENCARGOS SOCIAIS',
                          'INVESTIMENTOS', 'AMORTIZACAO DE DIVIDA', 'JUROS E ENCARGOS DA DIVIDA'];
      if (!out.tipo_despesa || wrongTipos.includes(String(out.tipo_despesa))) {
        out.tipo_despesa = resolveTipo(
          out.codigo_nome_uo as string | null,
          out.codigo_nome_projeto_atividade as string | null,
          out.codigo_nome_elemento as string | null,
        );
      }

      // 6. fonte_simpl → 2-way: TESOURO / FEDERAL (DEMAIS FONTES consolidado em TESOURO)
      const validFontes = ['TESOURO', 'FEDERAL'];
      if (!out.fonte_simpl || !validFontes.includes(String(out.fonte_simpl))) {
        const fRaw = String(out.codigo_nome_fonte_recurso ?? out.fonte_recurso ?? '');
        const fCode6 = fRaw.replace(/\D.*/, '').substring(0, 6);
        const fCode3 = fCode6.substring(0, 3);
        out.fonte_simpl = FONTE_BY_CODE[fCode6] ?? FONTE_BY_CODE[fCode3] ?? 'TESOURO';
      }

      // 7. pago_total
      if (out.pago_total == null || out.pago_total === '') {
        out.pago_total = (Number(out.pago) || 0) + (Number(out.pago_anos_anteriores) || 0);
      }

      // 8. unidade (alias de codigo_nome_uo)
      if (!out.unidade) out.unidade = out.codigo_nome_uo ?? null;

      // 9. rotulo = código-nome do projeto atividade
      if (!out.rotulo) out.rotulo = out.codigo_nome_projeto_atividade ?? null;

      return out;
    });

  // ── Pipeline pós-upload incremental (D1) ─────────────────────────────────
  const runPipelineForYears = async (years: number[]) => {
    setStep('processing');
    const steps: {label:string; status:'wait'|'running'|'ok'|'warn'}[] = [];
    setProcSteps([...steps]);
    setProcProgress(10);
    try {
      const validYears = Array.from(new Set(years)).filter(y => Number.isFinite(y));
      if (!validYears.length) return;

      for (let i = 0; i < validYears.length; i++) {
        const ano = validYears[i];
        steps.push({ label: `Aplicando enriquecimento de dados ${ano} no D1...`, status: 'running' });
        setProcSteps([...steps]);

        const fixRes = await fetch(`${WORKER_URL}/api/fix-year`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ano, token: IMPORT_TOKEN }),
        }).then(r => r.json()) as { ok?: boolean; changes?: number; error?: string };
        if (fixRes.error) throw new Error(fixRes.error);

        const fixIdx = steps.length - 1;
        steps[fixIdx] = { ...steps[fixIdx], status: 'ok', label: `✓ Enriquecimento ${ano}: ${fixRes.changes ?? 0} campos corrigidos` };
        setProcSteps([...steps]);

        steps.push({ label: `Recalculando agregados de ${ano}...`, status: 'running' });
        setProcSteps([...steps]);
        try {
          const TOTAL_DIMS = 17;
          let offset = 0;
          let totalInserted = 0;
          while (offset < TOTAL_DIMS) {
            const aggRes = await fetch(`${WORKER_URL}/api/query`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'rebuild_agg', ano, offset, count: 5, token: IMPORT_TOKEN }),
            }).then(r => r.json()) as { ok?: boolean; rows_inserted?: number; next_offset?: number; done?: boolean; error?: string };
            if (!aggRes.ok) throw new Error(aggRes.error ?? 'rebuild_agg failed');
            totalInserted += aggRes.rows_inserted ?? 0;
            if (aggRes.done) break;
            offset = aggRes.next_offset ?? TOTAL_DIMS;
          }
          const aggIdx = steps.length - 1;
          steps[aggIdx] = { ...steps[aggIdx], status: 'ok', label: `✓ Agregados de ${ano} recalculados (${totalInserted} linhas)` };
          setProcSteps([...steps]);
        } catch {
          const aggIdx = steps.length - 1;
          steps[aggIdx] = { ...steps[aggIdx], status: 'warn', label: `⚠ Agregados de ${ano} não recalculados` };
          setProcSteps([...steps]);
        }

        setProcProgress(Math.min(70, Math.round(((i + 1) / validYears.length) * 70)));
      }
    } catch (e: unknown) {
      throw e;
    }
  };

  const handleLcFile = async (file: File) => {
    setLcFileName(file.name);
    setStep('parsing');
    try {
      if (!/lc\s*131|lc131/i.test(file.name)) throw new Error('Selecione o arquivo LC131 para a primeira etapa.');
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

      const shape = hasImportShape(raw[0]);
      if (!shape.hasAnoRef && shape.hasConsolidatedAno && shape.hasPagoTotalOnly) {
        throw new Error('Arquivo consolidado detectado (ANO + PAGO TOTAL). Para importação LC131 use o layout bruto com ano_referencia, empenhado, liquidado, pago e pago_anos_anteriores.');
      }
      if (!shape.hasAnoRef) {
        throw new Error('Coluna obrigatória ausente: ano_referencia. Verifique o layout do arquivo LC131.');
      }

      setLcRows(raw);
      setStep(obRows.length ? 'preview' : 'idle');
    } catch (e: unknown) { setMessage((e as Error).message); setStep('error'); }
  };

  const handleObFile = async (file: File) => {
    setObFileName(file.name);
    setStep('parsing');
    try {
      if (!/lis\s*ob|lisob/i.test(file.name)) throw new Error('Selecione o arquivo LisOB para a segunda etapa.');
      if (!file.name.match(/\.(xlsx|xls)$/i)) throw new Error('Apenas arquivos .xlsx são suportados para LisOB.');
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matrix: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      let hIdx = 3;
      for (let i = 2; i < Math.min(8, matrix.length); i++) {
        const row = matrix[i] as unknown[];
        const texts = row.filter(v => typeof v === 'string' && v.trim().length > 2);
        if (texts.length >= 5) { hIdx = i; break; }
      }

      const rawHeaders = (matrix[hIdx] as unknown[]).map(h => normHeader(String(h ?? '')));
      const colMap: Record<number, string> = {};
      rawHeaders.forEach((h, i) => {
        const d1Col = OB_COL_MAP[h];
        if (d1Col) colMap[i] = d1Col;
      });
      const mapped = Object.values(colMap);
      if (mapped.length < 4) throw new Error(`LisOB sem colunas reconhecidas. Detectadas: ${rawHeaders.filter(Boolean).slice(0, 5).join(', ')}`);

      const SKIP = ['total geral', 'total', 'subtotal'];
      const parsed: DataRow[] = [];
      for (let i = hIdx + 1; i < matrix.length; i++) {
        const arr = matrix[i] as unknown[];
        if (arr.every(v => v === '' || v == null)) continue;
        const first = String(arr[0] ?? '').toLowerCase().trim();
        if (SKIP.some(s => first.startsWith(s))) continue;
        const row: DataRow = {};
        for (const [idx, d1Col] of Object.entries(colMap)) {
          const j = Number(idx);
          let v: unknown = arr[j] ?? null;
          if (d1Col === 'data_lancamento') v = excelSerial(v);
          else if (d1Col === 'ano_referencia') v = parseInt(String(v)) || null;
          else if (d1Col === 'valor_documento') v = parseFloat(String(v)) || 0;
          else v = (v === '' || v == null) ? null : String(v).trim();
          row[d1Col] = v;
        }
        if (!row.numero_documento && !row.ano_referencia) continue;
        parsed.push(row);
      }

      if (!parsed.length) throw new Error('Nenhum registro LisOB encontrado.');
      setObRows(parsed);
      setStep(lcRows.length ? 'preview' : 'idle');
    } catch (e: unknown) { setMessage((e as Error).message); setStep('error'); }
  };

  const handleUpload = async () => {
    if (!confirm) { setConfirm(true); return; }
    setConfirm(false); setStep('uploading'); setProgress(0);
    const CHUNK = 1000;
    const CHUNK_OB = 500;
    let uploadedLc = 0;
    let uploadedOb = 0;
    try {
      if (!lcRows.length || !obRows.length) throw new Error('Selecione os dois arquivos: LC131 e LisOB.');

      // ── Enriquecimento: calcula campos derivados ausentes no XLSX ────────────
      setMessage('Enriquecendo dados...');
      let uploadRows = enrichForD1(lcRows);

      // Detecta ano(s) do LC131 para pipeline incremental
      const lcYears = Array.from(new Set(uploadRows
        .map(r => Number(r.ano_referencia))
        .filter(y => Number.isFinite(y) && y >= 2000 && y <= 2030)));
      if (!lcYears.length) throw new Error('Não foi possível detectar o ano no arquivo LC131 (ano_referencia).');

      // ── Lookup DRS/RRAS/IBGE dos municípios via Worker ───────────────────────
      try {
        setMessage('Buscando referências de municípios...');
        const refRes = await fetch(`${WORKER_URL}/api/municipio-refs`);
        if (refRes.ok) {
          const muniRefs = await refRes.json() as Record<string, {
            drs: string; regiao_ad: string; rras: string; regiao_sa: string; cod_ibge: string;
          }>;
          uploadRows = uploadRows.map(r => {
            const mun = String(r.municipio ?? '').toUpperCase().trim();
            const ref = muniRefs[mun];
            if (ref && !r.drs) {
              return { ...r, drs: ref.drs, regiao_ad: ref.regiao_ad, rras: ref.rras, regiao_sa: ref.regiao_sa, cod_ibge: ref.cod_ibge };
            }
            return r;
          });
        }
      } catch { /* DRS/RRAS lookup opcional */ }
      setMessage('');

      // ── Importa LC131 em modo incremental (INSERT OR IGNORE no backend) ────
      for (let i = 0; i < uploadRows.length; i += CHUNK) {
        const impRes = await fetch(`${WORKER_URL}/api/import-despesas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: IMPORT_TOKEN, rows: uploadRows.slice(i, i + CHUNK) }),
        }).then(r => r.json()) as { ok?: boolean; inserted?: number; error?: string };
        if (!impRes.ok && impRes.error) throw new Error(impRes.error);
        uploadedLc += impRes.inserted ?? 0;
        setProgress(Math.round(((i + CHUNK) / uploadRows.length) * 45));
      }

      await runPipelineForYears(lcYears);

      // ── Importa LisOB em modo incremental/upsert por numero_documento ───────
      setStep('uploading');
      setMessage('Importando LisOB...');
      for (let i = 0; i < obRows.length; i += CHUNK_OB) {
        const batch = obRows.slice(i, i + CHUNK_OB);
        const obRes = await fetch(`${WORKER_URL}/api/import-ob`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: IMPORT_TOKEN, rows: batch, skip_enrich: true }),
        }).then(r => r.json()) as { ok?: boolean; inserted?: number; error?: string };
        if (!obRes.ok && obRes.error) throw new Error(obRes.error);
        uploadedOb += obRes.inserted ?? 0;
        const pctOb = Math.round(((i + CHUNK_OB) / obRows.length) * 45);
        setProgress(Math.min(95, 50 + pctOb));
      }

      // ── Enriquece LisOB com join por numero_processo em lotes ───────────────
      setStep('processing');
      setMessage('Relacionando LisOB com LC131...');
      let guard = 0;
      while (guard < 40) {
        const e = await fetch(`${WORKER_URL}/api/enrich-ob`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: IMPORT_TOKEN, batch_size: 1000 }),
        }).then(r => r.json()) as { ok?: boolean; done?: boolean; remaining?: number; error?: string };
        if (e.error) throw new Error(e.error);
        if (e.done) break;
        guard += 1;
      }

      setProgress(100);
      setMessage(`Atualização incremental concluída. LC131 novos: ${uploadedLc.toLocaleString('pt-BR')} | LisOB atualizadas: ${uploadedOb.toLocaleString('pt-BR')}.`);
      onImportDone?.();
      setStep('done');
    } catch (e: unknown) { setMessage((e as Error).message); setStep('error'); }
  };

  const reset = () => { setStep('idle'); setLcRows([]); setObRows([]); setLcFileName(''); setObFileName(''); setProgress(0); setMessage(''); setConfirm(false); setProcSteps([]); setProcProgress(0); };
  const lcCols = lcRows.length ? Object.keys(lcRows[0]) : [];
  const lcYears = Array.from(new Set(lcRows.map(r => Number(r.ano_referencia)).filter(y => Number.isFinite(y)))).sort((a, b) => a - b);
  const obYears = Array.from(new Set(obRows.map(r => Number(r.ano_referencia)).filter(y => Number.isFinite(y)))).sort((a, b) => a - b);
  const ready = lcRows.length > 0 && obRows.length > 0;

  return (
    <div className="fixed inset-0 z-[10000] flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-lg h-full bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E5E5E5] flex items-center justify-between bg-[#FAFAFA]">
          <div className="flex items-center gap-2.5">
            <Upload className="w-4 h-4 text-[#118DFF]" />
            <div>
              <p className="font-bold text-[#333] text-sm">Atualização Incremental</p>
              <p className="text-[10px] text-[#999]">LC131 + LisOB no mesmo processamento</p>
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
          {(step === 'idle' || step === 'preview') && (
            <div className="space-y-3">
              <div onDrop={e => { e.preventDefault(); e.dataTransfer.files[0] && handleLcFile(e.dataTransfer.files[0]); }}
                onDragOver={e => e.preventDefault()} onClick={() => lcFileRef.current?.click()}
                className="bg-[#F8FBFF] border-2 border-dashed border-[#118DFF]/30 rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-[#118DFF] transition group">
                <FileSpreadsheet className="w-8 h-8 text-[#118DFF]/40 group-hover:text-[#118DFF]" />
                <div className="text-center">
                  <p className="font-semibold text-[#333]">Arquivo LC131</p>
                  <p className="text-xs text-[#999] mt-0.5">.xlsx ou .csv</p>
                  {lcFileName && <p className="text-[11px] text-[#118DFF] font-mono mt-1 truncate max-w-[360px]">{lcFileName}</p>}
                </div>
                <input ref={lcFileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => e.target.files?.[0] && handleLcFile(e.target.files[0])} />
              </div>

              <div onDrop={e => { e.preventDefault(); e.dataTransfer.files[0] && handleObFile(e.dataTransfer.files[0]); }}
                onDragOver={e => e.preventDefault()} onClick={() => obFileRef.current?.click()}
                className="bg-[#FFF8F5] border-2 border-dashed border-[#E66C37]/30 rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-[#E66C37] transition group">
                <FileSpreadsheet className="w-8 h-8 text-[#E66C37]/40 group-hover:text-[#E66C37]" />
                <div className="text-center">
                  <p className="font-semibold text-[#333]">Arquivo LisOB</p>
                  <p className="text-xs text-[#999] mt-0.5">.xlsx</p>
                  {obFileName && <p className="text-[11px] text-[#E66C37] font-mono mt-1 truncate max-w-[360px]">{obFileName}</p>}
                </div>
                <input ref={obFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => e.target.files?.[0] && handleObFile(e.target.files[0])} />
              </div>

              <div className="bg-[#FAFAFA] border border-[#E5E5E5] rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-[#666]">LC131 lidas</span><span className="font-bold text-[#118DFF]">{lcRows.length.toLocaleString('pt-BR')}</span></div>
                <div className="flex justify-between"><span className="text-[#666]">LisOB lidas</span><span className="font-bold text-[#E66C37]">{obRows.length.toLocaleString('pt-BR')}</span></div>
                <div className="flex justify-between"><span className="text-[#666]">Anos LC131</span><span className="font-bold text-[#333]">{lcYears.length ? lcYears.join(', ') : '-'}</span></div>
                <div className="flex justify-between"><span className="text-[#666]">Anos LisOB</span><span className="font-bold text-[#333]">{obYears.length ? obYears.join(', ') : '-'}</span></div>
              </div>
            </div>
          )}
          {step === 'parsing' && <div className="flex flex-col items-center gap-3 py-10"><Spinner size={7} /><p className="text-sm text-[#666]">Processando...</p></div>}
          {step === 'preview' && (
            <div className="space-y-3">
              <div className="border rounded-lg p-3 flex items-start gap-2.5 bg-blue-50 border-blue-200">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
                <div>
                  <p className="font-semibold text-sm text-blue-800">Modo incremental fixo</p>
                  <p className="text-xs mt-0.5 text-blue-700">
                    Não deleta dados existentes. O LC131 insere somente novos registros e o LisOB atualiza por número de documento.
                  </p>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-[#999] uppercase mb-1">Colunas LC131 ({lcCols.length})</p>
                <div className="flex flex-wrap gap-1">{lcCols.slice(0,20).map(c => <span key={c} className="px-1.5 py-0.5 bg-[#F0F0F0] text-[#666] text-[9px] font-mono rounded">{c}</span>)}</div>
              </div>
              {!confirm ? (
                <div className="flex gap-2 pt-1">
                  <button onClick={reset} className="flex-1 py-2 text-sm font-semibold text-[#666] border border-[#D0D0D0] rounded-lg hover:bg-[#FAFAFA]">Cancelar</button>
                  <button onClick={handleUpload} disabled={!ready} className="flex-1 py-2 text-sm font-bold bg-[#118DFF] text-white rounded-lg hover:bg-[#0D7AE8] disabled:opacity-50 disabled:cursor-not-allowed">Importar LC131 + LisOB</button>
                </div>
              ) : (
                <div className="border rounded-lg p-3 space-y-2 bg-blue-50 border-blue-200">
                  <p className="font-semibold text-sm text-blue-800">Confirma atualização incremental dos dois arquivos?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirm(false)} className="flex-1 py-1.5 text-xs font-semibold border border-[#D0D0D0] rounded bg-white">Não</button>
                    <button onClick={handleUpload} className="flex-1 py-1.5 text-xs font-bold text-white rounded bg-[#118DFF]">Sim, atualizar incremental</button>
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
          {step === 'processing' && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2.5">
                <Spinner size={4} />
                <p className="text-sm font-semibold text-[#333]">Processando dados importados...</p>
              </div>
              <div className="h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                <div className="h-full bg-[#118DFF] rounded-full transition-all duration-500" style={{ width: procProgress + '%' }} />
              </div>
              <p className="text-right text-[10px] text-[#999] font-mono">{procProgress}%</p>
              <div className="space-y-2">
                {procSteps.map((s, i) => (
                  <div key={i} className={`flex items-start gap-2.5 rounded-lg px-3 py-2 text-xs ${
                    s.status === 'running' ? 'bg-blue-50 border border-blue-200' :
                    s.status === 'ok'      ? 'bg-green-50 border border-green-200' :
                    s.status === 'warn'    ? 'bg-amber-50 border border-amber-200' :
                    'bg-[#FAFAFA] border border-[#E5E5E5]'
                  }`}>
                    <span className="shrink-0 mt-0.5">
                      {s.status === 'running' ? <Spinner size={3} /> :
                       s.status === 'ok'      ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> :
                       s.status === 'warn'    ? <AlertCircle className="w-3.5 h-3.5 text-amber-500" /> :
                       <span className="w-3.5 h-3.5 rounded-full border border-[#CCC] inline-block" />}
                    </span>
                    <span className={`leading-snug ${
                      s.status === 'running' ? 'text-blue-800 font-semibold' :
                      s.status === 'ok'      ? 'text-green-800' :
                      s.status === 'warn'    ? 'text-amber-800' :
                      'text-[#999]'
                    }`}>{s.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[#999] text-center">Não feche esta janela enquanto processa.</p>
            </div>
          )}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <div><p className="font-bold text-[#333]">Atualização incremental concluída!</p><p className="text-sm text-[#666] mt-1">{message}</p></div>
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
// --- OB Tab ---
interface ObSummaryData {
  totals: { total: number; processos: number; valor_total: number; credores: number };
  byYear: { ano: number; total: number; valor: number; credores: number }[];
  linked: { ob_vinculadas: number; processos_vinculados: number };
  topCredores: { credor: string; total: number; valor: number }[];
  porDrs:   { drs: string; ob_total: number; municipios: number; valor: number }[];
  porTipo:  { tipo_despesa: string; ob_total: number; valor: number }[];
  porMunic: { municipio: string; regiao_ad: string; drs: string; ob_total: number; valor: number }[];
}
interface ObDetailRow {
  id: number; ano_referencia: number; mes_lancamento: string;
  codigo_nome_credor: string; data_lancamento: string;
  numero_documento: string; valor_documento: number;
  codigo_nome_ug: string; codigo_uo: string;
  descricao_documento: string; codigo_nome_orgao: string;
  numero_documento_origem: string; ne_origem: string;
  codigo_nome_fonte_recurso: string; codigo_nome_programa: string;
  codigo_nome_elemento: string; numero_processo: string;
  // joined from despesas
  municipio?: string; drs?: string; rras?: string; regiao_ad?: string; tipo_despesa?: string;
}

function ObTab({ onUploadClick }: { onUploadClick: () => void }) {
  const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'https://lc131-api.sessp-css2.workers.dev';
  const [summary, setSummary] = useState<ObSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchProc, setSearchProc] = useState('');
  const [searchCreedor, setSearchCreedor] = useState('');
  const [anoFilter, setAnoFilter] = useState<number | ''>('');
  const [detailRows, setDetailRows] = useState<ObDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSearched, setDetailSearched] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${WORKER_URL}/api/ob-summary`)
      .then(r => r.json())
      .then((d: unknown) => {
        const data = d as ObSummaryData & { ok?: boolean };
        if (data.ok !== false) setSummary(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [WORKER_URL]);

  const searchDetail = async () => {
    setDetailLoading(true); setDetailSearched(true);
    try {
      const params: Record<string, string> = { action: 'ob_detail', limit: '200' };
      if (anoFilter) params.p_ano = String(anoFilter);
      if (searchProc.trim()) params.processo = searchProc.trim();
      if (searchCreedor.trim()) params.credor = searchCreedor.trim();
      const res = await fetch(`${WORKER_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json() as { ok?: boolean; rows?: ObDetailRow[]; error?: string };
      setDetailRows(data.rows ?? []);
    } catch { setDetailRows([]); }
    setDetailLoading(false);
  };

  const totalObs    = summary?.totals?.total ?? 0;
  const obVinc      = summary?.linked?.ob_vinculadas ?? 0;
  const pctVinc     = totalObs > 0 ? Math.round((obVinc / totalObs) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Header + upload button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[#1B1B1B]">Ordens Bancárias (OB)</h2>
          <p className="text-[11px] text-[#888] mt-0.5">Lis OB 2022–2026 · relacionamento via Número de Processo com LC 131</p>
        </div>
        <button onClick={onUploadClick}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#E66C37] text-white text-xs font-bold rounded-lg hover:bg-[#D05A25] transition">
          <Upload className="w-3.5 h-3.5" />
          Atualizar LC131 + LisOB
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Spinner size={6} /></div>
      ) : !summary || totalObs === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <DollarSign className="w-12 h-12 text-[#DDD]" />
          <div>
            <p className="font-bold text-[#666]">Nenhuma OB importada</p>
            <p className="text-xs text-[#999] mt-1">Execute a atualização conjunta com os arquivos LC131 e LisOB para começar.</p>
          </div>
          <button onClick={onUploadClick}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#E66C37] text-white text-sm font-bold rounded-lg hover:bg-[#D05A25]">
            <Upload className="w-4 h-4" />
            Atualizar LC131 + LisOB
          </button>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Total OBs" value={totalObs.toLocaleString('pt-BR')}
              icon={<FileText className="w-4 h-4" />} color="#E66C37" />
            <KpiCard label="Valor Total" value={fmt(summary.totals.valor_total, 'compact')}
              icon={<DollarSign className="w-4 h-4" />} color="#118DFF" />
            <KpiCard label="OBs Vinculadas à LC 131" value={`${obVinc.toLocaleString('pt-BR')} (${pctVinc}%)`}
              sub={`${(summary.linked.processos_vinculados ?? 0).toLocaleString('pt-BR')} processos em comum`}
              icon={<CheckCircle2 className="w-4 h-4" />} color="#1AAB40" />
            <KpiCard label="Credores únicos" value={(summary.totals.credores ?? 0).toLocaleString('pt-BR')}
              icon={<Users className="w-4 h-4" />} color="#6B007B" />
          </div>

          {/* Vinculação alert */}
          {pctVinc < 100 && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <p>
                <strong>{(totalObs - obVinc).toLocaleString('pt-BR')}</strong> OBs ({100 - pctVinc}%) não possuem correspondência na LC 131 via Número de Processo.
                Isso pode indicar registros de anos distintos ou processos não presentes na planilha de despesas.
              </p>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {/* OBs por ano */}
            <Card title="OBs por Ano" icon={<BarChart3 className="w-4 h-4" />}>
              <div className="space-y-2">
                {(summary.byYear ?? []).map(r => {
                  const pct = summary.totals.valor_total > 0 ? (r.valor / summary.totals.valor_total) * 100 : 0;
                  return (
                    <div key={r.ano} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-[#333]">{r.ano}</span>
                        <span className="text-[#666]">{r.total.toLocaleString('pt-BR')} OBs · {fmt(r.valor, 'compact')}</span>
                      </div>
                      <div className="h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                        <div className="h-full bg-[#E66C37] rounded-full" style={{ width: pct + '%' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Top credores */}
            <Card title="Top 10 Credores (por valor)" icon={<Users className="w-4 h-4" />}>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {(summary.topCredores ?? []).slice(0, 10).map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-[#F5F5F5] last:border-0">
                    <span className="text-[#999] w-5 shrink-0 text-right font-mono">{i + 1}</span>
                    <span className="flex-1 text-[#333] truncate">{c.credor}</span>
                    <span className="text-[#666] shrink-0 font-mono">{fmt(c.valor, 'compact')}</span>
                    <span className="text-[#999] shrink-0 text-[10px]">({c.total})</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* OBs por DRS + por Tipo Despesa (vinculação LC 131) */}
          {((summary.porDrs ?? []).length > 0 || (summary.porTipo ?? []).length > 0) && (
            <div className="grid md:grid-cols-2 gap-4">
              {(summary.porDrs ?? []).length > 0 && (
                <Card title="OBs por DRS (via LC 131)" icon={<MapPin className="w-4 h-4" />}>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {(summary.porDrs ?? []).map((r, i) => {
                      const maxVal = summary.porDrs[0]?.valor ?? 1;
                      const pct = (r.valor / maxVal) * 100;
                      return (
                        <div key={i} className="text-xs">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-[#333] truncate max-w-[55%]">{r.drs}</span>
                            <span className="text-[#666] shrink-0">{r.ob_total} OBs · {fmt(r.valor, 'compact')}</span>
                          </div>
                          <div className="h-1 bg-[#F0F0F0] rounded-full overflow-hidden">
                            <div className="h-full bg-[#1B7AB5] rounded-full" style={{ width: pct + '%' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
              {(summary.porTipo ?? []).length > 0 && (
                <Card title="OBs por Tipo de Despesa (via LC 131)" icon={<Tag className="w-4 h-4" />}>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {(summary.porTipo ?? []).slice(0, 15).map((r, i) => {
                      const maxVal = summary.porTipo[0]?.valor ?? 1;
                      const pct = (r.valor / maxVal) * 100;
                      return (
                        <div key={i} className="text-xs">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-[#333] truncate max-w-[55%]">{r.tipo_despesa}</span>
                            <span className="text-[#666] shrink-0">{r.ob_total} OBs · {fmt(r.valor, 'compact')}</span>
                          </div>
                          <div className="h-1 bg-[#F0F0F0] rounded-full overflow-hidden">
                            <div className="h-full bg-[#E66C37] rounded-full" style={{ width: pct + '%' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Search OBs */}
          <Card title="Consultar OBs" icon={<Search className="w-4 h-4" />}>
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <select value={anoFilter} onChange={e => setAnoFilter(e.target.value ? Number(e.target.value) : '')}
                  className="h-8 px-2 text-xs border border-[#D0D0D0] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#E66C37]">
                  <option value="">Todos os anos</option>
                  {(summary.byYear ?? []).map(r => <option key={r.ano} value={r.ano}>{r.ano}</option>)}
                </select>
                <input value={searchProc} onChange={e => setSearchProc(e.target.value)} placeholder="Número do Processo"
                  className="h-8 px-2 text-xs border border-[#D0D0D0] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#E66C37] flex-1 min-w-[160px]" />
                <input value={searchCreedor} onChange={e => setSearchCreedor(e.target.value)} placeholder="Credor (busca parcial)"
                  className="h-8 px-2 text-xs border border-[#D0D0D0] rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#E66C37] flex-1 min-w-[160px]" />
                <button onClick={searchDetail} disabled={detailLoading}
                  className="h-8 px-4 bg-[#E66C37] text-white text-xs font-bold rounded hover:bg-[#D05A25] disabled:opacity-50 flex items-center gap-1.5">
                  {detailLoading ? <Spinner size={3} /> : <Search className="w-3.5 h-3.5" />}
                  Buscar
                </button>
              </div>

              {detailSearched && (
                detailLoading ? (
                  <div className="flex justify-center py-4"><Spinner size={5} /></div>
                ) : detailRows.length === 0 ? (
                  <p className="text-xs text-[#999] text-center py-4">Nenhuma OB encontrada.</p>
                ) : (
                  <div className="overflow-x-auto rounded border border-[#E5E5E5]">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="bg-[#F8F8F8] border-b border-[#E5E5E5]">
                          {['Ano','Mês','Data','Nº Documento','Credor','Valor','Órgão/UG','Elemento','Processo','Município (LC 131)','DRS','Tipo Despesa'].map(h => (
                            <th key={h} className="px-2 py-1.5 text-left font-bold text-[#555] whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F5F5F5]">
                        {detailRows.map((row, i) => (
                          <tr key={i} className={cn('hover:bg-[#FAFAFA]', row.municipio ? 'bg-white' : 'bg-amber-50/30')}>
                            <td className="px-2 py-1">{row.ano_referencia}</td>
                            <td className="px-2 py-1">{row.mes_lancamento}</td>
                            <td className="px-2 py-1 whitespace-nowrap">{row.data_lancamento}</td>
                            <td className="px-2 py-1 font-mono">{row.numero_documento}</td>
                            <td className="px-2 py-1 max-w-[180px] truncate">{row.codigo_nome_credor}</td>
                            <td className="px-2 py-1 text-right font-mono">{fmt(row.valor_documento, 'currency')}</td>
                            <td className="px-2 py-1 max-w-[140px] truncate">{row.codigo_nome_ug || row.codigo_uo}</td>
                            <td className="px-2 py-1 max-w-[120px] truncate">{row.codigo_nome_elemento}</td>
                            <td className="px-2 py-1 font-mono">{row.numero_processo}</td>
                            <td className="px-2 py-1">{row.municipio ?? <span className="text-[#BBB] italic">—</span>}</td>
                            <td className="px-2 py-1">{row.drs ?? '—'}</td>
                            <td className="px-2 py-1 max-w-[120px] truncate">{row.tipo_despesa ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {detailRows.length >= 200 && (
                      <p className="text-[10px] text-[#999] text-center py-1.5 bg-[#FAFAFA] border-t border-[#E5E5E5]">
                        Mostrando primeiros 200 resultados. Refine a busca para ver mais.
                      </p>
                    )}
                  </div>
                )
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ── Modal de Metodologia ────────────────────────────────────────────────────
function MetodologiaModal({ onClose }: { onClose: () => void }) {
  const Section = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#2A2A2A]">
        <span className="text-[#118DFF]">{icon}</span>
        <h3 className="text-[13px] font-bold text-[#EEE] uppercase tracking-wide">{title}</h3>
      </div>
      <div className="space-y-2 text-[12px] text-[#BBB] leading-relaxed">{children}</div>
    </div>
  );
  const Row = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
    <div className="flex items-start gap-3 py-1.5 border-b border-[#1E1E1E]">
      <span className="text-[#777] text-[11px] w-44 shrink-0">{label}</span>
      <span className={cn('text-[#CCC] text-[12px]', mono && 'font-mono text-[#7EC8E3]')}>{value}</span>
    </div>
  );
  const Badge = ({ color, children }: { color: string; children: React.ReactNode }) => (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: color + '22', color }}>{children}</span>
  );
  const Code = ({ children }: { children: React.ReactNode }) => (
    <code className="bg-[#0D0D0D] text-[#7EC8E3] font-mono text-[11px] px-2 py-0.5 rounded border border-[#2A2A2A]">{children}</code>
  );

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-[#141414] rounded-2xl shadow-2xl border border-[#2A2A2A] w-full max-w-3xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#118DFF]/20 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-[#118DFF]" />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-white">Metodologia de Consolidação</h2>
              <p className="text-[11px] text-[#666]">Como os dados LC131 e LisOB foram integrados</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#222] hover:bg-[#333] text-[#888] transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body scrollável */}
        <div className="overflow-y-auto px-6 py-5 flex-1">

          {/* 1. Fontes */}
          <Section title="1. Fontes de Dados" icon={<FileSpreadsheet className="w-4 h-4" />}>
            <p>Dois conjuntos de planilhas XLSX são utilizados como fonte primária:</p>
            <div className="mt-3 space-y-2">
              <div className="bg-[#1A1A1A] rounded-lg p-3 border border-[#2A2A2A]">
                <div className="flex items-center gap-2 mb-2">
                  <Badge color="#118DFF">LC 131</Badge>
                  <span className="text-[#EEE] font-semibold">Planilhas de Despesas</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 text-[11px] text-[#999]">
                  <span>LC_131_2022.xlsx → 96.925 linhas</span>
                  <span>LC_131_2025.xlsx → 110.403 linhas</span>
                  <span>LC_131_2023.xlsx → 114.812 linhas</span>
                  <span>LC 131_2026.xlsx → 51.842 linhas</span>
                  <span>LC_131_2024.xlsx → 102.972 linhas</span>
                  <span className="text-[#118DFF] font-bold">Total: 476.954 despesas</span>
                </div>
              </div>
              <div className="bg-[#1A1A1A] rounded-lg p-3 border border-[#2A2A2A]">
                <div className="flex items-center gap-2 mb-2">
                  <Badge color="#E66C37">LisOB</Badge>
                  <span className="text-[#EEE] font-semibold">Ordens Bancárias</span>
                </div>
                <div className="text-[11px] text-[#999]">
                  <span>Lis OB - Entidades e municipios (4).xlsx → <strong className="text-[#E66C37]">72.243 OBs</strong> (2022–2026) | R$ 26,93B em pagamentos</span>
                </div>
              </div>
            </div>
          </Section>

          {/* 2. Estrutura das tabelas */}
          <Section title="2. Estrutura das Tabelas (Cloudflare D1)" icon={<Database className="w-4 h-4" />}>
            <p>Os dados são armazenados em SQLite (Cloudflare D1) com duas tabelas principais:</p>
            <div className="mt-3 space-y-4">
              <div>
                <p className="text-[#EEE] font-semibold mb-2 flex items-center gap-2">
                  <Code>despesas</Code> <span className="text-[#666]">— 476.954 linhas</span>
                </p>
                <Row label="Chave primária" value="(numero_processo, codigo_nome_uo, codigo_nome_elemento, ano_referencia)" mono />
                <Row label="Identificadores" value="numero_processo — código SIAFEM 11 dígitos (ex: 20220096409)" mono />
                <Row label="Classificação LC131" value="codigo_nome_uo, codigo_nome_elemento, codigo_nome_projeto_atividade" mono />
                <Row label="Valores financeiros" value="empenhado, liquidado, pago, pago_anos_anteriores, pago_total" mono />
                <Row label="Localização" value="municipio, drs, rras, regiao_ad, regiao_sa, cod_ibge" mono />
                <Row label="Tipologia" value="tipo_despesa, grupo_despesa, grupo_simpl, fonte_simpl" mono />
                <Row label="Importação" value="INSERT OR IGNORE — idempotente, sem duplicados" />
              </div>
              <div>
                <p className="text-[#EEE] font-semibold mb-2 flex items-center gap-2">
                  <Code>ob</Code> <span className="text-[#666]">— 72.243 linhas</span>
                </p>
                <Row label="Chave de ligação" value="numero_processo — mesmo formato 11 dígitos da tabela despesas" mono />
                <Row label="Identificadores OB" value="numero_documento, numero_ob, data_ob, favorecido" mono />
                <Row label="Valor" value="valor (R$) — referente ao pagamento da OB" mono />
                <Row label="Classificação" value="ano_referencia, entidade, municipio" mono />
              </div>
            </div>
          </Section>

          {/* 3. Chave de relacionamento */}
          <Section title="3. Chave de Relacionamento OB ↔ Despesas" icon={<Tag className="w-4 h-4" />}>
            <div className="bg-[#0D1A2A] rounded-lg p-4 border border-[#1A3A5A] mb-3">
              <p className="text-[#7EC8E3] font-bold text-[13px] mb-2">Chave: <Code>numero_processo</Code></p>
              <p>O campo <Code>numero_processo</Code> é o elo entre as duas tabelas. Ambas usam o formato SIAFEM de <strong className="text-white">11 dígitos numéricos</strong> (ex: <Code>20220096409</Code>, <Code>20230154782</Code>).</p>
            </div>
            <p className="mb-2">O relacionamento é feito via:</p>
            <pre className="bg-[#0D0D0D] text-[#7EC8E3] text-[11px] font-mono rounded-lg p-3 border border-[#2A2A2A] overflow-x-auto whitespace-pre">{`SELECT COUNT(*) as ob_vinculadas,
       COUNT(DISTINCT o.numero_processo) as processos_vinculados
FROM ob o
WHERE o.numero_processo IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM despesas d
    WHERE d.numero_processo = o.numero_processo
  )`}</pre>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {[
                { ano: 2022, vinc: '14.490', total: '14.493', pct: '100%' },
                { ano: 2023, vinc: '16.478', total: '16.481', pct: '100%' },
                { ano: 2024, vinc: '17.191', total: '17.192', pct: '100%' },
                { ano: 2025, vinc: '19.075', total: '19.077', pct: '100%' },
                { ano: 2026, vinc: '4.987',  total: '5.000',  pct: '99,7%' },
              ].map(r => (
                <div key={r.ano} className="bg-[#1A1A1A] rounded-lg p-2.5 border border-[#2A2A2A] text-center">
                  <p className="text-[#118DFF] font-bold text-[13px]">{r.ano}</p>
                  <p className="text-[#EEE] text-[11px] font-semibold">{r.pct}</p>
                  <p className="text-[#666] text-[10px]">{r.vinc}/{r.total}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-[#666]">
              <strong className="text-[#888]">Nota:</strong> O resultado é cacheado em <Code>ob_linkage_cache</Code> para evitar re-computação a cada consulta. O cache é invalidado automaticamente quando novos dados são importados.
            </p>
          </Section>

          {/* 4. Resolução de tipo_despesa */}
          <Section title="4. Resolução de tipo_despesa (Hierarquia 7 Níveis)" icon={<Layers className="w-4 h-4" />}>
            <p>O campo <Code>tipo_despesa</Code> é preservado directamente das planilhas LC131 (sem reclassificação). Para upload incremental pelo painel, aplica-se a seguinte hierarquia de lookup estático gerado a partir de 416.811 linhas históricas:</p>
            <div className="mt-3 space-y-1.5">
              {[
                { n: 1, key: 'UO5 + proj4',    desc: 'Código da Unidade Orçamentária (5 dígitos) + Código do Projeto (4 dígitos) — regra mais específica' },
                { n: 2, key: 'UO5',             desc: 'Código da UO sozinha — cobre UOs de propósito único (ex: Hemocentro, Irmandade)' },
                { n: 3, key: 'proj4 + elem6',   desc: 'Código do Projeto + Elemento de Despesa (6 dígitos)' },
                { n: 4, key: 'proj4',           desc: 'Código do Projeto sozinho — programas singulares (ex: proj 9001–9020 → Intraorçamentária)' },
                { n: 5, key: 'elem6 + proj4',   desc: 'Elemento (6 dígitos) + Projeto — composite gerado do CSV histórico' },
                { n: 6, key: 'elem6',           desc: 'Primeiros 6 dígitos do código do elemento (ex: 319001 → Transferência Voluntária)' },
                { n: 7, key: 'elem3 (prefixo)', desc: 'Primeiros 3 dígitos: 319→Unidade Própria, 334/335→Transferência Voluntária, 44x→Investimento' },
              ].map(r => (
                <div key={r.n} className="flex items-start gap-3 bg-[#1A1A1A] rounded-lg px-3 py-2 border border-[#222]">
                  <span className="w-5 h-5 rounded-full bg-[#118DFF]/20 text-[#118DFF] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{r.n}</span>
                  <div>
                    <Code>{r.key}</Code>
                    <span className="ml-2 text-[11px] text-[#999]">{r.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-[#666]">Lookup gerado por <Code>_build-tipo-composite.cjs</Code> e armazenado em <Code>src/data/tipo_by_elem_proj.json</Code> (248 regras composite + 81 por elem6).</p>
          </Section>

          {/* 5. Pipeline de importação */}
          <Section title="5. Pipeline de Importação (LC131 → D1)" icon={<Upload className="w-4 h-4" />}>
            <p>A importação das planilhas XLSX para o D1 segue os seguintes passos, executados pelo script <Code>scripts/_lc131-to-d1.cjs</Code>:</p>
            <div className="mt-3 space-y-2">
              {[
                { step: '①', title: 'Leitura XLSX',       desc: 'A biblioteca xlsx lê cada aba da planilha LC131 por ano e mapeiam os cabeçalhos para os nomes de colunas D1.' },
                { step: '②', title: 'Enriquecimento',     desc: 'DRS/RRAS/Região são resolvidos via lookup estático de municípios. grupo_despesa e grupo_simpl são derivados do código do grupo. fonte_simpl (ESTADUAL/FEDERAL) é derivada do código da fonte de recurso.' },
                { step: '③', title: 'Geração SQL',        desc: 'Os dados são divididos em ficheiros SQL temporários com INSERT OR IGNORE INTO despesas (80 linhas/INSERT, 15 ficheiros/batch = 1.200 linhas/chamada wrangler).' },
                { step: '④', title: 'Execução via Wrangler', desc: 'Cada ficheiro SQL é executado via npx wrangler d1 execute --file --remote --yes, contornando o limite HTTP do Worker (10 MB).' },
                { step: '⑤', title: 'Pós-processamento',  desc: 'fix_year normaliza typos nos tipos (ex: TRANFERÊNCIA→TRANSFERÊNCIA). rebuild_agg reconstrói a tabela de agregados por DRS/município/tipo em 4 rondas.' },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-3 bg-[#1A1A1A] rounded-lg px-3 py-2.5 border border-[#222]">
                  <span className="text-[#118DFF] font-bold text-[14px] shrink-0 w-5 text-center">{s.step}</span>
                  <div>
                    <p className="text-[#DDD] font-semibold text-[11px]">{s.title}</p>
                    <p className="text-[#888] text-[11px] mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* 6. Integridade */}
          <Section title="6. Garantias de Integridade" icon={<CheckCircle2 className="w-4 h-4" />}>
            <div className="grid grid-cols-1 gap-2">
              {[
                { ok: true,  label: 'INSERT OR IGNORE',           desc: 'Importação idempotente — re-executar não cria duplicados.' },
                { ok: true,  label: 'tipo_despesa preservado',     desc: 'Os tipos originais das planilhas LC131 não são substituídos pelo classificador automático (force_tipo_reclassify=false).' },
                { ok: true,  label: 'numero_processo 11 dígitos',  desc: 'O formato SIAFEM é validado em ambas as tabelas (ob e despesas) para garantir joins correctos.' },
                { ok: true,  label: 'ob_linkage_cache',            desc: 'Calculado directamente do D1 (ob JOIN despesas) — nunca via fonte secundária com formato diferente.' },
                { ok: false, label: '_compute-ob-linkage.cjs',     desc: 'Script desactivado — usava a tabela ob do Turso (formato diferente: "2021/40516"), produzindo 0% de match para 2022/2023.' },
              ].map((g, i) => (
                <div key={i} className="flex items-start gap-3 bg-[#1A1A1A] rounded-lg px-3 py-2 border border-[#222]">
                  <span className={cn('shrink-0 mt-0.5', g.ok ? 'text-[#1AAB40]' : 'text-[#D64550]')}>
                    {g.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  </span>
                  <div>
                    <Code>{g.label}</Code>
                    <span className="ml-2 text-[11px] text-[#888]">{g.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Footer */}
          <div className="mt-2 pt-4 border-t border-[#2A2A2A] text-[10px] text-[#555] flex items-center gap-2">
            <Info className="w-3 h-3 shrink-0" />
            <span>Base: Cloudflare D1 · Worker: lc131-api.sessp-css2.workers.dev · Última importação: 27/05/2026 · Dados: SES-SP / CGOF</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
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
  const [obUploadOpen, setObUploadOpen]   = useState(false);
  const [pwdGateOpen, setPwdGateOpen]     = useState(false);
  const [pwdInput, setPwdInput]           = useState('');
  const [pwdError, setPwdError]           = useState(false);
  const [menuOpen, setMenuOpen]           = useState(false);
  const [metodologiaOpen, setMetodologiaOpen] = useState(false);
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

  const [lastImportAt, setLastImportAt]   = useState<Date | null>(() => { try { const s = localStorage.getItem('lc131_lastImportAt'); return s ? new Date(s) : null; } catch { return null; } });

  // -- Pivot tab (multi-level, Excel-style) --
  const [pivotDims, setPivotDims]           = useState<string[]>(['municipio','fonte_simpl','grupo_simpl','tipo_despesa']);
  const [pivotMultiRaw, setPivotMultiRaw]   = useState<MultiPivotRow[]>([]);
  const [pivotLoading, setPivotLoading]     = useState(false);
  const [pivotError, setPivotError]         = useState<string|null>(null);
  const [pivotExpanded, setPivotExpanded]   = useState<Set<string>>(new Set());
  const [pivotValueKey, setPivotValueKey]   = useState<'pago_total'|'empenhado'|'liquidado'>('pago_total');
  const [pivotXlsxLoading, setPivotXlsxLoading] = useState(false);
  const pivotDragIdx = useRef<number | null>(null);

  const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? 'https://lc131-api.sessp-css2.workers.dev';

  // -- Retry helper for RPC calls (Worker API em vez de Supabase) --
  const rpcWithRetry = useCallback(async (fnName: string, params: Record<string, unknown>, retries = 1) => {
    const ACTION_MAP: Record<string, string> = { 'lc131_dashboard': 'dashboard', 'lc131_distincts': 'distincts' };
    const action = ACTION_MAP[fnName] ?? fnName;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await fetch(`${WORKER_URL}/api/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...params }),
        });
        const data = await res.json();
        if (!res.ok) return { data: null, error: { code: String(res.status), message: (data as Record<string,unknown>).error as string ?? 'Worker error' } };
        return { data, error: null };
      } catch (e: unknown) {
        if (attempt < retries - 1) { await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); continue; }
        return { data: null, error: { code: 'NETWORK', message: (e as Error).message } };
      }
    }
    return { data: null, error: { code: 'TIMEOUT', message: 'upstream request timeout após múltiplas tentativas' } };
  }, [WORKER_URL]);

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
        porFonteSimpl: (() => { const raw = (d.por_fonte_simpl as Record<string,unknown>[] ?? []).map(r => ({ fonte_simpl: String(r.fonte_simpl), empenhado: Number(r.empenhado ?? 0), liquidado: Number(r.liquidado ?? 0), pago_total: Number(r.pago_total ?? 0) })); const m = new Map<string, {fonte_simpl: string; empenhado: number; liquidado: number; pago_total: number}>(); for (const r of raw) { const cat = (r.fonte_simpl === 'Federal' || r.fonte_simpl === 'FEDERAL') ? 'FEDERAL' : 'ESTADUAL'; const e = m.get(cat); if (e) { e.empenhado += r.empenhado; e.liquidado += r.liquidado; e.pago_total += r.pago_total; } else { m.set(cat, { fonte_simpl: cat, empenhado: r.empenhado, liquidado: r.liquidado, pago_total: r.pago_total }); } } return Array.from(m.values()); })(),
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
          const res = await fetch(`${WORKER_URL}/api/years`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const yr = await res.json() as { min: number; max: number };
          const maxAno = yr.max ?? new Date().getFullYear();
          const minAno = yr.min ?? maxAno;
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
      // Pass normalized values directly to lc131_distincts (it does its own ILIKE filtering)
      // NOT expandFilterValues — that would break cascade by expanding to raw DB variants
      Object.entries(cf).forEach(([k, v]) => {
        if (Array.isArray(v) && v.length > 0) params[k] = v.join('|');
      });

      let nextDistincts = EMPTY_DISTINCTS;
      const { data: rpc, error: rpcErr } = await rpcWithRetry('lc131_distincts', params);
      if (!rpcErr) nextDistincts = buildDistinctState(rpc as Record<string, unknown> | undefined);

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
      const params: Record<string, unknown> = { action: 'detail', p_limit: DETAIL_PAGE_SIZE, p_offset: page * DETAIL_PAGE_SIZE };
      if (anoSel !== 'todos') params.p_ano = Number(anoSel);
      if (search.trim()) {
        params.p_codigo_ug = search.trim();
      } else {
        Object.entries(filters).forEach(([k, v]) => {
          if (Array.isArray(v) && v.length > 0) params[k] = expandFilterValues(k, v).join('|');
        });
      }
      const res = await fetch(`${WORKER_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const d = await res.json() as { rows?: Record<string,unknown>[]; total?: number; error?: string };
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      const rows = (d.rows ?? []).map(r => enrichDetailRow(r));
      setDetailTotal(d.total ?? rows.length); setDetailRows(rows); setDetailPage(page);
    } catch (e: unknown) { setDetailError((e as Error).message); }
    finally { setDetailLoading(false); }
  }, [anoSel, filters, WORKER_URL]);

  const detailDeb = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (activeTab !== 'dados') return;
    clearTimeout(detailDeb.current);
    detailDeb.current = setTimeout(() => loadDetail(0, tableSearch), 600);
    return () => clearTimeout(detailDeb.current);
  }, [filters, anoSel, activeTab]);

  // -- Load multi-level pivot (lc131_pivot_multi RPC) --
  const loadPivot = useCallback(async () => {
    setPivotLoading(true); setPivotError(null);
    try {
      const dims = [...pivotDims, '', '', '', ''].slice(0, 4);
      const params: Record<string, unknown> = {
        p_dim1: dims[0], p_dim2: dims[1], p_dim3: dims[2], p_dim4: dims[3],
      };
      if (anoSel !== 'todos') params.p_ano = Number(anoSel);
      // Pass raw filter values (not expanded PostgREST patterns) to the RPC
      Object.entries(filters).forEach(([k, v]) => {
        if (Array.isArray(v) && v.length > 0) params[k] = v.join('|');
      });
      const res = await fetch(`${WORKER_URL}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pivot', ...params }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as Record<string,unknown>).error as string ?? `HTTP ${res.status}`);
      // Worker returns { error, timeout } on pivot timeout
      if (!Array.isArray(data) && (data as Record<string,unknown>).error) {
        throw new Error((data as Record<string,unknown>).error as string);
      }
      setPivotMultiRaw(Array.isArray(data) ? (data as Record<string,unknown>[]).map(r => ({
        d1: String(r.d1 ?? ''),
        d2: r.d2 != null ? String(r.d2) : null,
        d3: r.d3 != null ? String(r.d3) : null,
        d4: r.d4 != null ? String(r.d4) : null,
        ano_referencia: Number(r.ano_referencia),
        empenhado:  Number(r.empenhado  ?? 0),
        liquidado:  Number(r.liquidado  ?? 0),
        pago_total: Number(r.pago_total ?? 0),
      })) : []);
      setPivotExpanded(new Set());
    } catch (e: unknown) {
      setPivotError((e as Error).message);
    } finally {
      setPivotLoading(false);
    }
  }, [filters, anoSel, pivotDims, WORKER_URL]);

  useEffect(() => {
    if (activeTab !== 'pivot') return;
    loadPivot();
  }, [activeTab, filters, anoSel, loadPivot]);


  useEffect(() => {
    if (!initialLoaded.current) return;
    loadDistincts(filters, anoSel);
  }, [anoSel, loadDistincts]);

  const setFilter = async (key: DetailFilterKey, val: string[]) => {
    const nf = { ...filters };
    if (val.length > 0) nf[key] = val; else delete nf[key];
    setFilters(nf);
    // Exclude the key being edited so that filter's own options remain unfiltered (enables multi-select)
    const nfWithoutKey = { ...nf };
    delete nfWithoutKey[key];
    await loadDistincts(nfWithoutKey, anoSel);
  };
  const clearFilters = async () => { setFilters({}); await loadDistincts({}, anoSel); };
  const activeFilterCount = Object.values(filters).filter(v => Array.isArray(v) && v.length > 0).length;
  const handleRefresh = () => { cacheRef.current.clear(); setData(null); loadDashboard(anoSel, filters); loadDistincts(filters, anoSel); };

  useEffect(() => {
    if (activeTab === 'mapa' && filtersOpen) setFiltersOpen(false);
  }, [activeTab, filtersOpen]);

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
      const BATCH = 2000;
      let offset = 0;
      const allRows: DetailRow[] = [];
      const baseParams: Record<string, unknown> = { action: 'detail', p_limit: BATCH };
      if (anoSel !== 'todos') baseParams.p_ano = Number(anoSel);
      if (tableSearch.trim()) {
        baseParams.p_codigo_ug = tableSearch.trim();
      } else {
        Object.entries(filters).forEach(([k, v]) => {
          if (Array.isArray(v) && v.length > 0) baseParams[k] = expandFilterValues(k, v).join('|');
        });
      }
      while (true) {
        const res = await fetch(`${WORKER_URL}/api/query`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...baseParams, p_offset: offset }),
        });
        const d = await res.json() as { rows?: Record<string,unknown>[]; error?: string };
        if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
        const fetched = (d.rows ?? []).map(r => enrichDetailRow(r));
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
  const pctLiq  = kpis && kpis.empenhado  > 0 ? (kpis.liquidado / kpis.empenhado)  * 100 : 0;
  const pctPago = kpis && kpis.liquidado  > 0 ? (kpis.pago       / kpis.liquidado)  * 100 : 0;

  // -- Setup missing --
  if (viewMissing) return (
    <div className="min-h-screen bg-[#F3F2F1] flex items-center justify-center p-6">
      <div className="bg-white rounded-lg border border-amber-200 p-6 max-w-md w-full space-y-3">
        <AlertCircle className="w-6 h-6 text-amber-400" />
        <p className="font-bold text-[#333]">Setup necessário</p>
        <p className="text-sm text-[#666]">A API não está disponível. Entre em contato com o administrador do sistema.</p>
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
      <header className="sticky top-0 z-[1200] bg-[#1B1B1B] text-white shadow-md">
        <div className="max-w-screen-2xl mx-auto px-4 h-11 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/img/logo1.png" alt="Logo CSS" className="h-[84px] w-auto" />
            <span className="font-bold text-[13px] tracking-tight">Controle de Despesas</span>
            <span className="text-[12px] text-[#888] hidden sm:inline">Coordenadoria de Gestão Orçamentária e Financeira</span>
            {lastImportAt && (
              <span className="hidden md:inline text-[10px] text-[#AAA] border-l border-[#444] pl-2.5 ml-1">
                Atualizado em {lastImportAt.toLocaleDateString('pt-BR')} às {lastImportAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
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
                  <div className="fixed inset-0 z-[1198]" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-9 z-[1201] w-44 bg-[#1B1B1B] border border-[#333] rounded-xl shadow-2xl overflow-hidden">
                    <button onClick={() => { handleRefresh(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-[12px] font-semibold text-[#CCC] hover:bg-[#333] transition">
                      <RefreshCw className={cn('w-3.5 h-3.5 shrink-0', loading && 'animate-spin')} />
                      Atualizar dados
                    </button>
                    <div className="border-t border-[#333]" />
                    <button onClick={() => { setPwdInput(''); setPwdError(false); setPwdGateOpen(true); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-[12px] font-semibold text-[#118DFF] hover:bg-[#333] transition">
                      <Upload className="w-3.5 h-3.5 shrink-0" />
                      Atualização LC131 + LisOB
                    </button>
                    <div className="border-t border-[#333]" />
                    <button onClick={() => { setMetodologiaOpen(true); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-[12px] font-semibold text-[#A3D4A8] hover:bg-[#333] transition">
                      <BookOpen className="w-3.5 h-3.5 shrink-0" />
                      Metodologia dos dados
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* --.-.-.-.-.-.-.-TABS + YEARS --.-.-.-.-.-.-.-*/}
      <div className="sticky top-11 z-[1150] bg-white border-b border-[#E5E5E5] shadow-sm">
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
      {metodologiaOpen && <MetodologiaModal onClose={() => setMetodologiaOpen(false)} />}

      {/* --.-.-.-.-.-.-.-FILTER BAR --.-.-.-.-.-.-.-*/}
      {filtersOpen && (
        <div className="sticky top-[84px] z-[1150] bg-white border-b border-[#E5E5E5] shadow-md">
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
                  <KpiCard label="Liquidado"    value={fmt(kpis.liquidado, 'currency')} icon={<CheckCircle2 className="w-4 h-4" />} color="#1AAB40" sub={'% Liquidado: ' + pctLiq.toFixed(1) + '%'} />
                  <KpiCard label="Pago"         value={fmt(kpis.pago, 'currency')} icon={<TrendingUp className="w-4 h-4" />} color="#E66C37" sub={'% Pago: ' + pctPago.toFixed(1) + '%'} />
                  <KpiCard label="Pago Total"   value={fmt(kpis.pago_total, 'currency')} icon={<BarChart3 className="w-4 h-4" />} color="#6B007B" sub="pago + anos anteriores" />
                  <KpiCard label="Municípios"   value={fmt(kpis.municipios)} icon={<MapPin className="w-4 h-4" />} color="#197278" sub={(data?.porDrs.length ?? 0) + ' DRS'} />
                  <KpiCard label="Registros"    value={fmt(kpis.total)} icon={<Database className="w-4 h-4" />} color="#744EC2" sub={availableAnos.length + ' anos'} />
                </>}
            </div>

            {/* Grupo Simplificado + Fonte Simplificada  - DESTAQUE */}
            {data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Grupo de Despesa */}
                <Card title="Grupo de Despesa" icon={<Layers className="w-4 h-4" />}
                  info={"Gráfico de rosca (donut) mostrando a distribuição percentual das despesas pelos grupos orçamentários (Pessoal e Encargos Sociais, Juros, Outras Despesas Correntes, Investimentos e Inversões Financeiras).\n\nFórmula: % = Empenhado do grupo / Empenhado total × 100\n\nOs grupos são derivados do campo codigo_nome_grupo da tabela lc131_despesas, simplificados em categorias (Custeio, Investimento, Pessoal)."}>
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
                <Card title="Fonte de Recursos" icon={<Database className="w-4 h-4" />}
                  info={"Gráfico de rosca (donut) mostrando a distribuição percentual das despesas por origem do financiamento (Recursos Estaduais, Federais, etc.).\n\nFórmula: % = Empenhado da fonte / Empenhado total × 100\n\nDados extraídos do campo codigo_nome_fonte_recurso simplificado em ESTADUAL, FEDERAL ou OUTROS."}>
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
              <Card title="Evolução Anual - Empenhado / Liquidado / Pago" icon={<TrendingUp className="w-4 h-4" />}
                info={"Gráfico de barras verticais agrupadas mostrando a evolução ano a ano dos três estágios da despesa.\n\nFórmula: soma de empenhado / liquidado / pago_total agrupada por ano_referencia.\nPago Total = pago (ano corrente) + pago_anos_anteriores (restos a pagar).\n\nPermite comparar a evolução orçamentária entre os anos 2022–2026.\nDados: RPC lc131_dashboard, campo por_ano."}>
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
                <Card title="Top 5 DRS" icon={<MapPin className="w-4 h-4" />}
                  badge={<span className="text-[10px] font-bold text-[#118DFF] bg-blue-50 px-1.5 py-0.5 rounded">{data.porDrs.length}</span>}
                  info={"Ranking das 5 Diretorias Regionais de Saúde (DRS) com maior Empenhado, com barras agrupadas mostrando os 3 estágios.\n\nEmpenhado = total comprometido por empenho no período.\nLiquidado = valor cujo serviço/bem foi verificado como entregue.\nPago Total = pago no ano + pago_anos_anteriores (restos a pagar).\n\nDados: RPC lc131_dashboard, campo por_drs. Os dados são ordenados do maior para o menor empenhado."}>
                  <HGroupedBarChart data={data.porDrs.slice(0,5) as unknown as Record<string,unknown>[]} yKey="drs" series={S3} height={220} />
                </Card>
                <Card title="Top 5 Municípios" icon={<Building2 className="w-4 h-4" />}
                  badge={<span className="text-[10px] font-bold text-[#1AAB40] bg-green-50 px-1.5 py-0.5 rounded">{data.porMunic.length}</span>}
                  info={"Ranking dos 5 municípios com maior valor empenhado no período selecionado.\n\nFórmula: soma do campo empenhado agrupado por municipio.\n\nCada barra representa o total empenhado do município, com cores diferentes para facilitar a distinção. Dados: RPC lc131_dashboard, campo por_munic."}>
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
                <Card title="Top 5 Grupos Detalhados" icon={<BarChart3 className="w-4 h-4" />}
                  info={"Ranking dos 5 grupos orçamentários com maior Empenhado, com barras agrupadas para os 3 estágios da despesa.\n\nGrupos: 1-Pessoal, 2-Juros, 3-Outras Despesas Correntes, 4-Investimentos, 5-Inversões Financeiras.\nPago Total = pago + pago_anos_anteriores.\n\nDados: campo codigo_nome_grupo, RPC lc131_dashboard."}>
                  <HGroupedBarChart
                    data={data.porGrupo.slice(0,5) as unknown as Record<string,unknown>[]}
                    yKey="grupo_despesa"
                    series={S3}
                    height={220}
                  />
                </Card>
                <Card title="Top 5 Fontes de Recursos" icon={<Database className="w-4 h-4" />}
                  info={"Ranking das 5 fontes de recurso com maior Empenhado.\n\nEmpenhado = total comprometido pela fonte de financiamento.\nPago Total = pago no ano + pago_anos_anteriores (restos a pagar).\n\nDados: campo codigo_nome_fonte_recurso, RPC lc131_dashboard."}>
                  <HGroupedBarChart data={data.porFonte.slice(0,5) as unknown as Record<string,unknown>[]} yKey="fonte_recurso" series={S2} height={200} />
                </Card>
              </div>
            )}

            {/* Elemento + UO */}
            {data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Top 5 Elementos" icon={<Database className="w-4 h-4" />}
                  info={"Ranking dos 5 elementos de despesa com maior Empenhado. O elemento especifica a natureza do gasto (ex: Outros Serviços de Terceiros, Material de Consumo).\n\nEmpenhado vs Pago Total = pago + pago_anos_anteriores.\n\nDados: campo codigo_nome_elemento, RPC lc131_dashboard."}>
                  <HGroupedBarChart data={data.porElemento.slice(0,5) as unknown as Record<string,unknown>[]} yKey="elemento" series={S2} height={200} />
                </Card>
                <Card title="Top 5 Unidades Orçamentárias" icon={<Building2 className="w-4 h-4" />}
                  info={"Ranking das 5 Unidades Orçamentárias (UO) com maior Empenhado. A UO é a divisão administrativa responsável pela dotação orçamentária.\n\nBarras: Empenhado / Liquidado / Pago Total.\nPago Total = pago + pago_anos_anteriores.\n\nDados: campo codigo_nome_uo, RPC lc131_dashboard."}>
                  <HGroupedBarChart data={data.porUo.slice(0,5) as unknown as Record<string,unknown>[]} yKey="uo" series={S3} height={220} />
                </Card>
              </div>
            )}

            {/* RRAS + Região Administrativa */}
            {data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Top 5 RRAS" icon={<Layers className="w-4 h-4" />}
                  info={"Ranking das 5 Redes Regionais de Atenção à Saúde (RRAS 01–17) com maior Empenhado.\n\nBarras: Empenhado / Liquidado / Pago Total.\nPago Total = pago + pago_anos_anteriores.\n\nDados: campo rras, populado via tabela tab_municipios, RPC lc131_dashboard."}>
                  <HGroupedBarChart data={data.porRras.slice(0,5) as unknown as Record<string,unknown>[]} yKey="rras" series={S3} height={220} />
                </Card>
                <Card title="Top 5 Regiões Administrativas" icon={<Globe className="w-4 h-4" />}
                  info={"Ranking das 5 Regiões Administrativas do Estado de SP com maior Empenhado.\n\nEmpenhado vs Pago Total = pago + pago_anos_anteriores.\n\nDados: campo regiao_ad, RPC lc131_dashboard, campo por_regiao_ad."}>
                  <HGroupedBarChart data={data.porRegiaoAd.slice(0,5) as unknown as Record<string,unknown>[]} yKey="regiao_ad" series={S2} height={200} />
                </Card>
              </div>
            )}

            {/* Região de Saúde + Tipo Despesa */}
            {data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Top 5 Regiões de Saúde" icon={<MapPin className="w-4 h-4" />}
                  info={"Ranking das 5 Regiões de Saúde do Estado de SP com maior Empenhado.\n\nEmpenhado vs Pago Total = pago + pago_anos_anteriores.\n\nDados: campo regiao_sa, RPC lc131_dashboard, campo por_regiao_sa."}>
                  <HGroupedBarChart data={data.porRegiaoSa.slice(0,5) as unknown as Record<string,unknown>[]} yKey="regiao_sa" series={S2} height={200} />
                </Card>
                <Card title="Top 5 Tipos de Despesa" icon={<BarChart3 className="w-4 h-4" />}
                  info={"Ranking dos 5 tipos de despesa programática com maior Empenhado (ex: ATENÇÃO BÁSICA, ALTA COMPLEXIDADE, MÉDIA COMPLEXIDADE).\n\nBarras: Empenhado / Liquidado / Pago Total.\nPago Total = pago + pago_anos_anteriores.\n\nDados: campo tipo_despesa, RPC lc131_dashboard."}>
                  <HGroupedBarChart data={data.porTipoDespesa.slice(0,5) as unknown as Record<string,unknown>[]} yKey="tipo_despesa" series={S3} height={220} />
                </Card>
              </div>
            )}

            {/* UG */}
            {data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Top 5 Unidades Gestoras" icon={<Building2 className="w-4 h-4" />}
                  info={"Ranking das 5 Unidades Gestoras (UG) com maior Empenhado. A UG é a unidade que executa efetivamente o orçamento da UO.\n\nEmpenhado vs Pago Total = pago + pago_anos_anteriores.\n\nDados: campo codigo_nome_ug, RPC lc131_dashboard."}>
                  <HGroupedBarChart data={data.porUg.slice(0,5) as unknown as Record<string,unknown>[]} yKey="ug" series={S2} height={200} />
                </Card>
                <Card title="Top 5 Projetos" icon={<Layers className="w-4 h-4" />}
                  info={"Ranking dos 5 projetos/atividades orçamentárias com maior Empenhado.\n\nEmpenhado vs Pago Total = pago + pago_anos_anteriores.\n\nDados: campo codigo_nome_projeto_atividade, RPC lc131_dashboard."}>
                  <HGroupedBarChart data={data.porProjeto.slice(0,5) as unknown as Record<string,unknown>[]} yKey="projeto" series={S2} height={200} />
                </Card>
              </div>
            )}

            {/* Favorecido + Projeto */}
            {data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Top 5 Favorecidos" icon={<Users className="w-4 h-4" />}
                  info={"Ranking dos 5 beneficiários/fornecedores com maior Empenhado no período.\n\nEmpenhado vs Pago Total = pago + pago_anos_anteriores.\n\nDados: campo codigo_nome_favorecido, RPC lc131_dashboard."}>
                  <HGroupedBarChart data={data.porFavorecido.slice(0,5) as unknown as Record<string,unknown>[]} yKey="favorecido" series={S2} height={200} />
                </Card>
                <Card title="Top 5 Rótulos" icon={<Layers className="w-4 h-4" />}
                  info={"Ranking dos 5 rótulos (nome simplificado do projeto/atividade) com maior Empenhado.\n\nEmpenhado vs Pago Total = pago + pago_anos_anteriores.\n\nRótulo é o campo rotulo da tabela lc131_despesas, preenchido automaticamente a partir de codigo_nome_projeto_atividade quando não informado no arquivo de origem.\nDados: RPC lc131_dashboard."}>
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
            ? data.porDrs.reduce((s, r) => s + (r.empenhado > 0 ? r.liquidado / r.empenhado : 0), 0) / data.porDrs.length * 100
            : 0;
          const topDrs = [...data.porDrs].sort((a, b) => b.empenhado - a.empenhado)[0];
          const worstExecDrs = [...data.porDrs].filter(r => r.empenhado > 0).sort((a, b) => (a.liquidado / a.empenhado) - (b.liquidado / b.empenhado))[0];
          const bestExecDrs = [...data.porDrs].filter(r => r.empenhado > 0).sort((a, b) => (b.liquidado / b.empenhado) - (a.liquidado / a.empenhado))[0];
          const drsExecData = data.porDrs.map(r => ({
            ...r,
            pct_exec: r.empenhado > 0 ? Math.round(r.liquidado / r.empenhado * 100) : 0,
            gap: r.empenhado - r.liquidado,
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
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">% Liquidado médio DRS</p>
                  <p className="font-bold text-[22px] leading-none" style={{ color: avgExecDrs >= 70 ? '#1AAB40' : avgExecDrs >= 40 ? '#D9B300' : '#D64550' }}>{avgExecDrs.toFixed(1)}%</p>
                  <p className="text-[11px] text-[#999] mt-0.5">liquidado / empenhado</p>
                </div>
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Melhor % Liquidado</p>
                  <p className="font-bold text-[#1AAB40] text-sm truncate">{bestExecDrs?.drs?.replace(/^DRS \d+ - /, '') ?? '-'}</p>
                  <p className="text-[11px] text-[#666] mt-0.5">{bestExecDrs ? (bestExecDrs.liquidado / bestExecDrs.empenhado * 100).toFixed(1) : 0}%</p>
                </div>
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Menor % Liquidado</p>
                  <p className="font-bold text-[#D64550] text-sm truncate">{worstExecDrs?.drs?.replace(/^DRS \d+ - /, '') ?? '-'}</p>
                  <p className="text-[11px] text-[#666] mt-0.5">{worstExecDrs ? (worstExecDrs.liquidado / worstExecDrs.empenhado * 100).toFixed(1) : 0}%</p>
                </div>
              </div>

              {/* % Liquidado por DRS - heatmap horizontal */}
              <Card title="% Liquidado por DRS  (Liquidado / Empenhado)" icon={<BarChart3 className="w-4 h-4" />}
                badge={<span className="text-[10px] text-[#999] bg-[#F0F0F0] px-1.5 py-0.5 rounded font-semibold">Concentração top-20%: {concentracao.toFixed(0)}%</span>}
                info={"Tabela-heatmap mostrando o percentual de liquidação de cada DRS, do maior para o menor.\n\nFórmula: % Liquidado = Liquidado / Empenhado × 100\n\nSemáforo de cores:\n\u2022 Verde (≥ 80%): execução ótima\n\u2022 Amarelo (50–79%): atenção\n\u2022 Vermelho (< 50%): crítico\n\nConcentração top-20% = share das DRS com maior % Liquidado sobre o total empenhado."}> 
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead><tr>
                      <th className="text-left text-[10px] font-bold text-[#999] uppercase pb-2 pr-3">DRS</th>
                      <th className="text-right text-[10px] font-bold text-[#118DFF] uppercase pb-2 px-3 w-36">Empenhado</th>
                      <th className="text-right text-[10px] font-bold text-[#1AAB40] uppercase pb-2 px-3 w-32">Liquidado</th>
                      <th className="text-right text-[10px] font-bold text-[#999] uppercase pb-2 px-3 w-20">% Liq.</th>
                      <th className="text-[10px] font-bold text-[#999] uppercase pb-2 pl-3">Barra de % Liquidado</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[#F7F7F7]">
                      {drsExecData.sort((a, b) => b.pct_exec - a.pct_exec).map((row, i) => {
                        const color = row.pct_exec >= 80 ? '#1AAB40' : row.pct_exec >= 50 ? '#D9B300' : '#D64550';
                        const shareW = totalEmpDrs > 0 ? (row.empenhado / totalEmpDrs) * 100 : 0;
                        return (
                          <tr key={i} className="hover:bg-blue-50/20">
                            <td className="py-1.5 pr-3 text-[11px] font-medium text-[#333] whitespace-nowrap">{row.drs.replace(/^DRS \d+ - /, '')}</td>
                            <td className="py-1.5 px-3 text-right font-mono text-[11px] text-[#118DFF]">{fmt(row.empenhado, 'compact')}</td>
                            <td className="py-1.5 px-3 text-right font-mono text-[11px] text-[#1AAB40]">{fmt(row.liquidado, 'compact')}</td>
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

              {/* DRS empenhado vs gap (não liquidado) — stacked */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Empenhado vs Pago por DRS  (Gap em vermelho)" icon={<MapPin className="w-4 h-4" />}
                  info={"Barras empilhadas (stacked) comparando Empenhado com Pago Total por DRS.\n\nPago Total (verde) = pago + pago_anos_anteriores.\nNão Pago (vermelho) = Gap = Empenhado − Pago Total.\n\nVisualição: quanto cada DRS ainda tem de recurso empenhado que não foi pago. Ordenado do maior para o menor empenhado."}>
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
                <Card title="Top 10 Municípios" icon={<Building2 className="w-4 h-4" />}
                  badge={<span className="text-[10px] text-[#999] bg-[#F0F0F0] px-1.5 py-0.5 rounded font-semibold">{data.porMunic.length} municípios</span>}
                  info={"Ranking dos 10 municípios com maior Empenhado no período, com barra de progresso indicando a participação percentual no total.\n\nShare = Empenhado do município / Empenhado total × 100.\n% Pago = Pago Total / Empenhado × 100.\n\nDados: campo municipio, RPC lc131_dashboard."}> 
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

              {/* RRAS — tabela hierárquica + Região de Saúde */}
              {(data.porRras.length > 0 || data.porRegiaoSa.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {data.porRras.length > 0 && (
                    <Card title="RRAS — Empenhado / Liquidado / Pago Total" icon={<Layers className="w-4 h-4" />}
                      badge={<span className="text-[10px] font-bold text-[#197278] bg-teal-50 px-1.5 py-0.5 rounded">{data.porRras.length} RRAS</span>}>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="bg-[#1a2234] text-white">
                              <th className="px-3 py-2 text-left font-semibold tracking-wide">RRAS</th>
                              <th className="px-3 py-2 text-right font-semibold text-blue-300">Empenhado</th>
                              <th className="px-3 py-2 text-right font-semibold text-green-300">Liquidado</th>
                              <th className="px-3 py-2 text-right font-semibold text-orange-300">Pago Total</th>
                              <th className="px-3 py-2 text-right font-semibold text-slate-300">% Liq.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F0F0F0]">
                            {[...data.porRras].sort((a, b) => a.rras.localeCompare(b.rras, 'pt-BR')).map((row, i) => {
                              const pct = row.empenhado > 0 ? (row.liquidado / row.empenhado * 100) : 0;
                              const color = pct >= 70 ? '#1AAB40' : pct >= 40 ? '#D9B300' : '#D64550';
                              return (
                                <tr key={i} className="hover:bg-blue-50/30" style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                                  <td className="px-3 py-2 font-semibold text-[#1e3a5f]">{row.rras}</td>
                                  <td className="px-3 py-2 text-right font-mono text-[#118DFF]">{fmt(row.empenhado, 'compact')}</td>
                                  <td className="px-3 py-2 text-right font-mono text-[#1AAB40]">{fmt(row.liquidado, 'compact')}</td>
                                  <td className="px-3 py-2 text-right font-mono text-[#E66C37]">{fmt(row.pago_total, 'compact')}</td>
                                  <td className="px-3 py-2 text-right font-bold" style={{ color }}>{pct.toFixed(1)}%</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-[#1a2234] text-white">
                              <td className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Geral</td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-blue-300">{fmt(data.porRras.reduce((s,r)=>s+r.empenhado,0),'compact')}</td>
                              <td className="px-3 py-2 text-right font-mono text-green-300">{fmt(data.porRras.reduce((s,r)=>s+r.liquidado,0),'compact')}</td>
                              <td className="px-3 py-2 text-right font-mono text-orange-300">{fmt(data.porRras.reduce((s,r)=>s+r.pago_total,0),'compact')}</td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </Card>
                  )}
                  {data.porRegiaoSa.length > 0 && (
                    <Card title="Regiões de Saúde — Empenhado / Pago" icon={<MapPin className="w-4 h-4" />}
                      badge={<span className="text-[10px] font-bold text-[#D64550] bg-red-50 px-1.5 py-0.5 rounded">{data.porRegiaoSa.length}</span>}
                      info={"Barras agrupadas por Região de Saúde mostrando Empenhado vs Pago Total.\n\nPago Total = pago + pago_anos_anteriores (restos a pagar).\n\nDados: campo regiao_sa, RPC lc131_dashboard."}> 
                      <HGroupedBarChart data={data.porRegiaoSa as unknown as Record<string,unknown>[]} yKey="regiao_sa" series={S2}
                        height={Math.max(200, data.porRegiaoSa.length * 40)} />
                    </Card>
                  )}
                </div>
              )}

              {/* Ranking DRS completo com semáforo */}
              <Card title="Ranking Completo de DRS" noPad icon={<BarChart3 className="w-4 h-4" />}
                badge={<span className="text-[10px] text-[#999] bg-[#F0F0F0] px-1.5 py-0.5 rounded font-semibold">{data.porDrs.length} DRS</span>}
                info={"Tabela detalhada com todas as DRS ordenadas por Empenhado (maior para menor).\n\nGap = Empenhado − Pago Total (recurso ainda não pago).\n% Exec. = Pago Total / Empenhado × 100.\nParticipação = Empenhado da DRS / Empenhado total geral × 100.\n\nCores do semáforo: verde ≥ 80%, amarelo 50–79%, vermelho < 50%."}> 
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
            liquidado: 0,
            pct_exec: r.empenhado > 0 ? Math.round(Number(r.pago_total ?? 0) / r.empenhado * 100) : 0,
            gap: r.empenhado - Number(r.pago_total ?? 0),
            share: totalEmpElem > 0 ? r.empenhado / totalEmpElem * 100 : 0,
          }));
          // % Liquidado por grupo detalhado
          const grupoExec = data.porGrupo.map(r => ({
            ...r,
            pct_exec: r.empenhado > 0 ? r.liquidado / r.empenhado * 100 : 0,
            liq_pct: r.empenhado > 0 ? r.liquidado / r.empenhado * 100 : 0,
            gap: r.empenhado - r.liquidado,
          })).sort((a, b) => b.empenhado - a.empenhado);
          const globalExec = kpis && kpis.empenhado > 0 ? kpis.liquidado / kpis.empenhado * 100 : 0;
          const globalLiq  = kpis && kpis.empenhado > 0 ? kpis.liquidado / kpis.empenhado * 100 : 0;
          const topElem = elemExecData.sort((a, b) => b.empenhado - a.empenhado)[0];
          const worstElem = elemExecData.filter(r => r.empenhado > 0).sort((a, b) => a.pct_exec - b.pct_exec)[0];

          return (
            <>
              {/* KPIs despesas */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Taxa Liquid.</p>
                  <p className="text-[22px] font-bold leading-none" style={{ color: globalLiq >= 70 ? '#1AAB40' : globalLiq >= 40 ? '#D9B300' : '#D64550' }}>{globalLiq.toFixed(1)}%</p>
                  <p className="text-[11px] text-[#999] mt-0.5">liquidado / empenhado</p>
                </div>
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Taxa Execução</p>
                  <p className="text-[22px] font-bold leading-none" style={{ color: globalExec >= 70 ? '#1AAB40' : globalExec >= 40 ? '#D9B300' : '#D64550' }}>{globalExec.toFixed(1)}%</p>
                  <p className="text-[11px] text-[#999] mt-0.5">liquidado / empenhado</p>
                </div>
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Maior elemento</p>
                  <p className="text-[12px] font-bold text-[#118DFF] truncate">{stripNumPrefix(topElem?.elemento ?? '-')}</p>
                  <p className="text-[11px] text-[#666] mt-0.5">{fmt(topElem?.share, 'number') ? topElem.share.toFixed(1) + '% do total' : '-'}</p>
                </div>
                <div className="bg-white rounded-lg border border-[#E5E5E5] p-4">
                  <p className="text-[10px] font-bold text-[#999] uppercase tracking-wide mb-1">Elemento c/ menor exec.</p>
                  <p className="text-[12px] font-bold text-[#D64550] truncate">{stripNumPrefix(worstElem?.elemento ?? '-')}</p>
                  <p className="text-[11px] text-[#666] mt-0.5">{worstElem ? (isNaN(worstElem.pct_exec) ? '-' : worstElem.pct_exec + '% exec.') : '-'}</p>
                </div>
              </div>

              {/* Funil de execução Emp → Liq → Pago */}
              <Card title="Funil de Execução Orçamentária" icon={<TrendingUp className="w-4 h-4" />}
                badge={<span className="text-[10px] text-[#999] bg-[#F0F0F0] px-1.5 py-0.5 rounded font-semibold">Valores globais do filtro</span>}
                info={"Visualização em funil dos 3 estágios da despesa pública (Lei nº 4.320/64).\n\nBarra de Empenhado = 100% (base de referência).\nBarra de Liquidado = Liquidado / Empenhado × 100.\nBarra de Pago Total = Pago Total / Empenhado × 100.\nPago Total = pago + pago_anos_anteriores.\nGap final = Empenhado − Pago Total (recurso empenhado mas ainda não pago)."}> 
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

              {/* ── ESTADUAL vs FEDERAL ── */}
              {data.porFonteSimpl.length > 0 && (() => {
                const totalEmp = data.porFonteSimpl.reduce((s, f) => s + f.empenhado, 0);
                const totalLiq = data.porFonteSimpl.reduce((s, f) => s + f.liquidado, 0);
                const totalPago = data.porFonteSimpl.reduce((s, f) => s + f.pago_total, 0);
                const est = data.porFonteSimpl.find(f => f.fonte_simpl === 'ESTADUAL') ?? { empenhado: 0, liquidado: 0, pago_total: 0 };
                const fed = data.porFonteSimpl.find(f => f.fonte_simpl === 'FEDERAL') ?? { empenhado: 0, liquidado: 0, pago_total: 0 };
                const estPct = totalEmp > 0 ? est.empenhado / totalEmp * 100 : 0;
                const fedPct = totalEmp > 0 ? fed.empenhado / totalEmp * 100 : 0;
                const estExec = est.empenhado > 0 ? est.pago_total / est.empenhado * 100 : 0;
                const fedExec = fed.empenhado > 0 ? fed.pago_total / fed.empenhado * 100 : 0;
                return (
                  <Card title="Origem dos Recursos — ESTADUAL vs FEDERAL" icon={<Database className="w-4 h-4" />}
                    badge={<span className="text-[10px] font-bold text-[#118DFF] bg-blue-50 px-1.5 py-0.5 rounded">Distribuição por fonte simplificada</span>}
                    info={"Comparação das despesas entre recursos do Tesouro Estadual e recursos Federais.\n\nSTADUAL = fontes começando com \"01\" ou contendo \"Tesouro\".\nFEDERAL = fontes contendo \"Federal\", \"SUS\" ou códigos específicos.\n\nExibe Empenhado, Liquidado e Pago Total de cada origem.\n% exec. = Pago Total / Empenhado × 100.\nDados: campo codigo_nome_fonte_recurso simplificado."}> 
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-1">
                      {/* ESTADUAL */}
                      <div className="bg-gradient-to-br from-[#EEF4FF] to-[#E3EDFF] border border-[#C7DAFF] rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-3 h-3 rounded-full bg-[#118DFF] shrink-0" />
                          <span className="text-[12px] font-bold text-[#1e3a5f] tracking-wide">ESTADUAL</span>
                          <span className="ml-auto text-[11px] font-bold text-[#118DFF] bg-white/70 px-1.5 py-0.5 rounded">{estPct.toFixed(1)}%</span>
                        </div>
                        <p className="text-[18px] font-bold text-[#118DFF] leading-tight">{fmt(est.empenhado, 'compact')}</p>
                        <p className="text-[10px] text-[#4a7fc1] mt-0.5">Empenhado</p>
                        <div className="mt-2.5 grid grid-cols-2 gap-2 text-[10px]">
                          <div><p className="text-[#777]">Liquidado</p><p className="font-semibold text-[#1AAB40]">{fmt(est.liquidado, 'compact')}</p></div>
                          <div><p className="text-[#777]">Pago Total</p><p className="font-semibold text-[#E66C37]">{fmt(est.pago_total, 'compact')}</p></div>
                        </div>
                        <div className="mt-2.5">
                          <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-[#777]">Execução</span>
                            <span className="font-bold" style={{ color: estExec >= 70 ? '#1AAB40' : estExec >= 40 ? '#D9B300' : '#D64550' }}>{estExec.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-[#118DFF]" style={{ width: Math.min(estExec, 100) + '%' }} />
                          </div>
                        </div>
                      </div>
                      {/* FEDERAL */}
                      <div className="bg-gradient-to-br from-[#EEF0FF] to-[#E5E8FF] border border-[#C0C7F5] rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-3 h-3 rounded-full bg-[#12239E] shrink-0" />
                          <span className="text-[12px] font-bold text-[#1e1e6f] tracking-wide">FEDERAL</span>
                          <span className="ml-auto text-[11px] font-bold text-[#12239E] bg-white/70 px-1.5 py-0.5 rounded">{fedPct.toFixed(1)}%</span>
                        </div>
                        <p className="text-[18px] font-bold text-[#12239E] leading-tight">{fmt(fed.empenhado, 'compact')}</p>
                        <p className="text-[10px] text-[#5a5ab5] mt-0.5">Empenhado</p>
                        <div className="mt-2.5 grid grid-cols-2 gap-2 text-[10px]">
                          <div><p className="text-[#777]">Liquidado</p><p className="font-semibold text-[#1AAB40]">{fmt(fed.liquidado, 'compact')}</p></div>
                          <div><p className="text-[#777]">Pago Total</p><p className="font-semibold text-[#E66C37]">{fmt(fed.pago_total, 'compact')}</p></div>
                        </div>
                        <div className="mt-2.5">
                          <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-[#777]">Execução</span>
                            <span className="font-bold" style={{ color: fedExec >= 70 ? '#1AAB40' : fedExec >= 40 ? '#D9B300' : '#D64550' }}>{fedExec.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-[#12239E]" style={{ width: Math.min(fedExec, 100) + '%' }} />
                          </div>
                        </div>
                      </div>
                      {/* Barra comparativa */}
                      <div className="flex flex-col justify-center gap-3">
                        <p className="text-[10px] font-bold text-[#AAA] uppercase tracking-wider">Distribuição Empenhado</p>
                        <div className="h-10 rounded-lg overflow-hidden flex">
                          <div className="h-full bg-[#118DFF] flex items-center justify-center" style={{ width: estPct + '%' }}>
                            {estPct > 10 && <span className="text-[10px] font-bold text-white">{estPct.toFixed(0)}%</span>}
                          </div>
                          <div className="h-full bg-[#12239E] flex items-center justify-center" style={{ width: fedPct + '%' }}>
                            {fedPct > 10 && <span className="text-[10px] font-bold text-white">{fedPct.toFixed(0)}%</span>}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                          <div><p className="text-[#AAA]">Total Emp.</p><p className="font-bold text-[#333]">{fmt(totalEmp, 'compact')}</p></div>
                          <div><p className="text-[#AAA]">Total Liq.</p><p className="font-bold text-[#1AAB40]">{fmt(totalLiq, 'compact')}</p></div>
                          <div><p className="text-[#AAA]">Total Pago</p><p className="font-bold text-[#E66C37]">{fmt(totalPago, 'compact')}</p></div>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })()}

              {/* Grupos + Elementos grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Grupo SIMPLIFICADO (Custeio/Investimento/Pessoal) + detalhado */}
                <Card title="Grupos de Despesa — Custeio · Investimento · Pessoal" icon={<Layers className="w-4 h-4" />}
                  info={"Análise da execução orçamentária por grupo agregado de despesa.\n\nCusteio = grupos 2 (Juros) + 3 (Outras Despesas Correntes).\nInvestimento = grupos 4 (Investimentos) + 5 (Inversões Financeiras).\nPessoal = grupo 1 (Pessoal e Encargos Sociais).\n\nShare = Empenhado do grupo / Empenhado total × 100.\n% Exec. = Pago Total / Empenhado × 100.\n~ESTADUAL / ~FEDERAL = estimativa proporcional com base na distribuição global das fontes."}> 
                  {/* Simplified group summary */}
                  {data.porGrupoSimpl.length > 0 && (() => {
                    const totSimpl = data.porGrupoSimpl.reduce((s, g) => s + g.empenhado, 0);
                    const estTotal = data.porFonteSimpl.find(f => f.fonte_simpl === 'ESTADUAL')?.empenhado ?? 0;
                    const fedTotal = data.porFonteSimpl.find(f => f.fonte_simpl === 'FEDERAL')?.empenhado ?? 0;
                    const globalTotal = estTotal + fedTotal || 1;
                    return (
                      <>
                        <div className="mb-3">
                          {[...data.porGrupoSimpl].sort((a, b) => b.empenhado - a.empenhado).map((g, i) => {
                            const color = GRUPO_COLORS[g.grupo_simpl] || '#A6A6A6';
                            const shareW = totSimpl > 0 ? g.empenhado / totSimpl * 100 : 0;
                            const pctExec = g.empenhado > 0 ? g.pago_total / g.empenhado * 100 : 0;
                            const execColor = pctExec >= 80 ? '#1AAB40' : pctExec >= 50 ? '#D9B300' : '#D64550';
                            const estAmt = g.empenhado * (estTotal / globalTotal);
                            const fedAmt = g.empenhado * (fedTotal / globalTotal);
                            return (
                              <div key={i} className="rounded-lg p-3 border mb-2" style={{ background: color + '10', borderColor: color + '30' }}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
                                    <span className="text-[12px] font-bold" style={{ color }}>{g.grupo_simpl.toUpperCase()}</span>
                                  </div>
                                  <span className="text-[11px] font-bold" style={{ color: execColor }}>{pctExec.toFixed(1)}% exec.</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
                                  <div>
                                    <p className="text-[#888]">Empenhado</p>
                                    <p className="font-bold text-[#118DFF]">{fmt(g.empenhado, 'compact')}</p>
                                  </div>
                                  <div>
                                    <p className="text-[#888]">~ESTADUAL</p>
                                    <p className="font-bold text-[#3b82f6]">{fmt(estAmt, 'compact')}</p>
                                  </div>
                                  <div>
                                    <p className="text-[#888]">~FEDERAL</p>
                                    <p className="font-bold text-[#6366f1]">{fmt(fedAmt, 'compact')}</p>
                                  </div>
                                </div>
                                <div className="relative h-2 bg-[#E5E5E5] rounded-full overflow-hidden">
                                  <div className="absolute h-full rounded-full" style={{ width: shareW + '%', background: color, opacity: 0.7 }} />
                                  <div className="absolute h-full rounded-full" style={{ width: Math.min(pctExec, shareW) + '%', background: color }} />
                                </div>
                                <div className="flex justify-between text-[9px] text-[#AAA] mt-0.5">
                                  <span>Share: {shareW.toFixed(1)}%</span>
                                  <span>Pago: {fmt(g.pago_total, 'compact')}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Detail grupos below */}
                        <p className="text-[9px] font-bold text-[#AAA] uppercase tracking-wider mb-1.5">Detalhamento por Grupo Orçamentário</p>
                      </>
                    );
                  })()}
                  <div className="flex flex-col gap-1.5">
                    {grupoExec.map((g, i) => {
                      const color = g.pct_exec >= 80 ? '#1AAB40' : g.pct_exec >= 50 ? '#D9B300' : '#D64550';
                      const shareW = totalEmpGrupo > 0 ? (g.empenhado / totalEmpGrupo) * 100 : 0;
                      return (
                        <div key={i} className="bg-[#FAFAFA] rounded-lg p-2 border border-[#F0F0F0]">
                          <div className="flex items-start justify-between mb-1">
                            <span className="text-[10px] font-semibold text-[#333] flex-1 pr-2">{stripNumPrefix(g.grupo_despesa)}</span>
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
                <Card title="Top 10 Elementos — Share + Execução" icon={<Database className="w-4 h-4" />}
                  info={"Tabela dos 10 maiores elementos de despesa por Empenhado.\n\nShare = Empenhado do elemento / Empenhado total × 100.\n% Exec. = Liquidado / Empenhado × 100.\nGap = Empenhado − Liquidado (valor empenhado mas ainda não liquidado).\n\nDados: campo codigo_nome_elemento, RPC lc131_dashboard."}> 
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
                <Card title="Unidades Orçamentárias — Emp / Liq / Pago (completo)" icon={<Building2 className="w-4 h-4" />}
                  info={"Barras agrupadas com todas as Unidades Orçamentárias (UO) e os 3 estágios da despesa.\n\nEmpenhado = total comprometido.\nLiquidado = valor verificado como entregue.\nPago Total = pago + pago_anos_anteriores.\n\nDados: campo codigo_nome_uo, RPC lc131_dashboard."}> 
                  <HGroupedBarChart data={data.porUo as unknown as Record<string,unknown>[]} yKey="uo" series={S3}
                    height={Math.max(220, data.porUo.length * 45)} />
                </Card>
                <Card title="Projetos / Atividades — Emp / Pago (completo)" icon={<Briefcase className="w-4 h-4" />}
                  info={"Barras agrupadas com todos os projetos/atividades orçamentárias e 2 estágios da despesa.\n\nEmpenhado = total comprometido.\nPago Total = pago + pago_anos_anteriores.\n\nDados: campo codigo_nome_projeto_atividade, RPC lc131_dashboard. Exibidos até 15 projetos."}> 
                  <HGroupedBarChart data={data.porProjeto.slice(0,15) as unknown as Record<string,unknown>[]} yKey="projeto" series={S2}
                    height={Math.max(220, Math.min(data.porProjeto.length, 15) * 45)} />
                </Card>
              </div>

              {/* Tipo de Despesa + Rótulo */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card title="Tipo de Despesa — Execução detalhada" icon={<Briefcase className="w-4 h-4" />}
                  info={"Tabela detalhada de execução por tipo de despesa programática (ex: ATENÇÃO BÁSICA, ALTA COMPLEXIDADE, MÉDIA COMPLEXIDADE, etc.).\n\nEmpenhado total por tipo.\n~ESTADUAL / ~FEDERAL = estimativa proporcional com base na distribuição global das fontes.\n% Pago = Pago Total / Empenhado × 100.\n\nDados: campo tipo_despesa, RPC lc131_dashboard."}> 
                  {data.porTipoDespesa.length > 0 ? (() => {
                    const totEmp = data.porTipoDespesa.reduce((s, r) => s + r.empenhado, 0);
                    const estTotal = data.porFonteSimpl.find(f => f.fonte_simpl === 'ESTADUAL')?.empenhado ?? 0;
                    const fedTotal = data.porFonteSimpl.find(f => f.fonte_simpl === 'FEDERAL')?.empenhado ?? 0;
                    const globalTotal = estTotal + fedTotal || 1;
                    return (
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="bg-[#1a2234] text-white">
                              <th className="px-3 py-2 text-left font-semibold">Tipo de Despesa</th>
                              <th className="px-3 py-2 text-right font-semibold text-blue-300">Empenhado</th>
                              <th className="px-3 py-2 text-right font-semibold" style={{ color: '#60a5fa' }}>~ESTADUAL</th>
                              <th className="px-3 py-2 text-right font-semibold" style={{ color: '#a5b4fc' }}>~FEDERAL</th>
                              <th className="px-3 py-2 text-right font-semibold text-orange-300">Exec%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...data.porTipoDespesa].sort((a, b) => b.empenhado - a.empenhado).map((t, i) => {
                              const pctExec = t.empenhado > 0 ? t.pago_total / t.empenhado * 100 : 0;
                              const color = pctExec >= 80 ? '#1AAB40' : pctExec >= 50 ? '#D9B300' : '#D64550';
                              const pctShare = totEmp > 0 ? t.empenhado / totEmp * 100 : 0;
                              // Approximate ESTADUAL/FEDERAL from global ratio
                              const estAmt = t.empenhado * (estTotal / globalTotal);
                              const fedAmt = t.empenhado * (fedTotal / globalTotal);
                              return (
                                <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff' }} className="hover:bg-blue-50/30">
                                  <td className="px-3 py-2.5">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: CHART_COLORS[(i+4) % CHART_COLORS.length] }} />
                                      <span className="font-semibold text-[#333]">{stripNumPrefix(t.tipo_despesa)}</span>
                                    </div>
                                    <div className="mt-1 relative h-1.5 bg-[#EBEBEB] rounded overflow-hidden w-full">
                                      <div className="absolute h-full bg-blue-200 rounded" style={{ width: pctShare + '%' }} />
                                      <div className="absolute h-full rounded" style={{ width: pctExec + '%', background: color, opacity: 0.8 }} />
                                    </div>
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-[#118DFF]">{fmt(t.empenhado, 'compact')}</td>
                                  <td className="px-3 py-2.5 text-right font-mono text-[#3b82f6]">~{fmt(estAmt, 'compact')}</td>
                                  <td className="px-3 py-2.5 text-right font-mono text-[#6366f1]">~{fmt(fedAmt, 'compact')}</td>
                                  <td className="px-3 py-2.5 text-right">
                                    <span className="font-bold" style={{ color }}>{pctExec.toFixed(1)}%</span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })() : <div className="text-center text-[#CCC] py-6"><Database className="w-6 h-6 mx-auto" /></div>}
                </Card>

                {/* Rótulo LC 131 */}
                <Card title="Rótulo LC 131 — Execução detalhada" icon={<Layers className="w-4 h-4" />}
                  info={"Barras horizontais com execução (Empenhado vs Pago Total) por Rótulo.\n\nRótulo é o campo rotulo da tabela lc131_despesas, preenchido automaticamente com o nome simplificado do projeto/atividade.\nPago Total = pago + pago_anos_anteriores.\n% Exec = Pago Total / Empenhado × 100.\n\nDados: campo rotulo, RPC lc131_dashboard."}> 
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
              <Card title="Tabela Completa — Elementos de Despesa" noPad icon={<Table2 className="w-4 h-4" />}
                info={"Tabela analítica com todos os elementos de despesa presentes no filtro selecionado, ordenados por Empenhado (maior para menor).\n\nEmpenhado = total comprometido por empenho.\nLiquidado = valor verificado como entregue.\nPago = valor pago no ano de referência.\nPago Total = pago + pago_anos_anteriores (restos a pagar).\n% Liq = Liquidado / Empenhado × 100.\n% Pago = Pago Total / Empenhado × 100."}> 
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
          // ── Derived data ───────────────────────────────────────────────
          const numDims = pivotDims.length;
          const pivotAnos = Array.from(new Set(pivotMultiRaw.map(r => r.ano_referencia))).sort((a, b) => a - b);
          const tree = buildPivotTree(pivotMultiRaw, numDims, pivotValueKey);
          const flatRows = flattenVisiblePivot(tree, pivotExpanded);
          const allExpandableKeys = collectAllPivotKeys(tree);

          // Grand totals from raw data
          const grandByYear: Record<number, number> = {};
          let grandTotal = 0;
          for (const row of pivotMultiRaw) {
            const v = Number(row[pivotValueKey] ?? 0);
            grandByYear[row.ano_referencia] = (grandByYear[row.ano_referencia] ?? 0) + v;
            grandTotal += v;
          }

          // Available dims to add (not already selected)
          const availableToAdd = MULTI_PIVOT_DIMS.filter(d => !pivotDims.includes(d.key));
          const COL_W = 155;
          const INDENT_PX = 20;

          // Level style helpers
          const levelStyle = (lvl: number, isLeaf: boolean, rowIdx: number) => {
            if (isLeaf) return {
              rowBg: rowIdx % 2 === 0 ? '#ffffff' : '#f9fafb',
              textColor: '#374151', fontWeight: 400, fontSize: '11.5px',
            };
            const palettes = [
              { rowBg: '#dbeafe', textColor: '#1e3a5f', fontWeight: 700, fontSize: '13px' },
              { rowBg: '#eff6ff', textColor: '#1e40af', fontWeight: 600, fontSize: '12px' },
              { rowBg: '#f0f9ff', textColor: '#0369a1', fontWeight: 600, fontSize: '11.5px' },
              { rowBg: '#f0fdf4', textColor: '#14532d', fontWeight: 500, fontSize: '11.5px' },
            ];
            return palettes[Math.min(lvl, palettes.length - 1)];
          };

          const totalTextColor = (lvl: number, isLeaf: boolean) => {
            if (isLeaf) return '#1f2937';
            return ['#1d4ed8', '#1d4ed8', '#0369a1', '#14532d'][Math.min(lvl, 3)];
          };

          // ── XLSX export ────────────────────────────────────────────────
          const downloadPivotXlsx = async () => {
            setPivotXlsxLoading(true);
            try {
              const XLSX = await import('xlsx');
              const dimLabels = pivotDims.map(k => MULTI_PIVOT_DIMS.find(d => d.key === k)?.label ?? k);
              const valLabel  = pivotValueKey === 'pago_total' ? 'Pago Total' : pivotValueKey === 'empenhado' ? 'Empenhado' : 'Liquidado';
              const header    = [...dimLabels, ...pivotAnos.map(String), 'Total Geral'];
              const aoa: (string | number)[][] = [header];

              const addNodeRows = (nodes: PivotTreeNode[], depthCols: string[]) => {
                for (const node of nodes) {
                  const cols: (string | number)[] = [...depthCols, node.label];
                  while (cols.length < numDims) cols.push('');
                  const yearVals = pivotAnos.map(a => node.byYear[a] ?? 0);
                  aoa.push([...cols, ...yearVals, node.total]);
                  if (node.children.length) addNodeRows(node.children, [...depthCols, node.label]);
                }
              };
              addNodeRows(tree, []);
              aoa.push(['TOTAL GERAL', ...Array(numDims - 1).fill(''), ...pivotAnos.map(a => grandByYear[a] ?? 0), grandTotal]);

              const ws = XLSX.utils.aoa_to_sheet(aoa);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, valLabel.substring(0, 31));
              XLSX.writeFile(wb, `pivot_multi_${valLabel.toLowerCase().replace(/\s/g,'_')}.xlsx`);
            } catch (e: unknown) {
              alert('Erro ao gerar XLSX: ' + (e as Error).message);
            } finally {
              setPivotXlsxLoading(false);
            }
          };

          // ── PDF export (browser print) ─────────────────────────────────
          const downloadPivotPdf = () => {
            const dimLabels = pivotDims.map(k => MULTI_PIVOT_DIMS.find(d => d.key === k)?.label ?? k).join(' / ');
            const valLabel  = pivotValueKey === 'pago_total' ? 'Pago Total' : pivotValueKey === 'empenhado' ? 'Empenhado' : 'Liquidado';
            const filterDesc = Object.entries(filters)
              .filter(([, v]) => Array.isArray(v) && (v as string[]).length > 0)
              .map(([k, v]) => {
                const meta = FILTER_META.find(f => f.key === k);
                return `${meta?.label ?? k}: ${(v as string[]).map(stripNumPrefix).join(', ')}`;
              }).join(' | ');

            const headerCols = [dimLabels, ...(pivotAnos as number[]).map(String), 'Total Geral'];
            const headerRow  = headerCols.map((h, i) => `<th style="text-align:${i===0?'left':'right'}">${h}</th>`).join('');

            const dataRows = flatRows.map((row, ri) => {
              const indent = '\u00a0'.repeat(row.level * 4);
              const label  = indent + (stripNumPrefix(row.label) || '(Vazio)');
              const bg = row.isLeaf
                ? (ri % 2 === 0 ? '#fff' : '#f9fafb')
                : ['#dbeafe','#eff6ff','#f0f9ff','#f0fdf4'][Math.min(row.level, 3)];
              const fw = row.isLeaf ? 400 : [700,600,600,500][Math.min(row.level, 3)];
              const yearCells = (pivotAnos as number[]).map(ano =>
                `<td style="text-align:right">${(row.byYear as Record<number,number>)[ano] ? fmt((row.byYear as Record<number,number>)[ano], 'currency') : '\u2014'}</td>`
              ).join('');
              return `<tr style="background:${bg};font-weight:${fw}">
                <td style="text-align:left;padding-left:${8 + row.level*16}px">${label}</td>${yearCells}
                <td style="text-align:right;font-weight:700">${fmt(row.total, 'currency')}</td></tr>`;
            }).join('');

            const grandRow = `<tr style="background:#1a2234;color:#fbbf24;font-weight:700">
              <td style="text-align:left">TOTAL GERAL</td>
              ${(pivotAnos as number[]).map(ano => `<td style="text-align:right">${fmt((grandByYear as Record<number,number>)[ano] ?? 0, 'currency')}</td>`).join('')}
              <td style="text-align:right">${fmt(grandTotal, 'currency')}</td></tr>`;

            const origin = window.location.origin;
            const html = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8">
<title>Tabela Din\u00e2mica \u2014 ${valLabel}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:9px;margin:0;padding:16px;color:#333}
  .hdr{display:flex;align-items:center;gap:12px;margin-bottom:14px;border-bottom:2px solid #1a2234;padding-bottom:10px}
  .hdr img{height:44px;object-fit:contain}
  .hdr-t h1{margin:0;font-size:15px;color:#1a2234}
  .hdr-t p{margin:3px 0 0;font-size:9px;color:#666}
  .meta{font-size:8px;color:#888;margin-bottom:10px}
  table{width:100%;border-collapse:collapse;font-size:9px}
  th{background:#1a2234;color:#fff;padding:5px 8px;border:1px solid #334;white-space:nowrap}
  td{padding:3px 8px;border:1px solid #e5e5e5;white-space:nowrap}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head><body>
<div class="hdr">
  <img src="${origin}/img/Bras\u00e3o.png" alt="Bras\u00e3o"/>
  <img src="${origin}/img/logo.png" alt="Logo"/>
  <div class="hdr-t">
    <h1>Controle Or\u00e7ament\u00e1rio \u2014 Tabela Din\u00e2mica</h1>
    <p>M\u00e9trica: ${valLabel} \u2022 Dimens\u00f5es: ${dimLabels}</p>
  </div>
</div>
${filterDesc ? `<p class="meta">Filtros: ${filterDesc}</p>` : ''}
<p class="meta">Gerado em: ${new Date().toLocaleString('pt-BR')} &nbsp;|&nbsp; ${flatRows.length} linhas vis\u00edveis</p>
<table>
  <thead><tr>${headerRow}</tr></thead>
  <tbody>${dataRows}${grandRow}</tbody>
</table>
</body></html>`;

            const win = window.open('', '_blank');
            if (!win) { alert('Permita pop-ups neste site para gerar o PDF'); return; }
            win.document.open(); win.document.write(html); win.document.close();
            win.addEventListener('load', () => { win.focus(); win.print(); });
          };

          return (
            <>
              {/* ── Control panel ─────────────────────────────────────── */}
              <div className="bg-white border border-[#E5E5E5] rounded-xl shadow-sm">

                {/* Row 1: Metric | Expand/Collapse | Count | Export */}
                <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 border-b border-[#F0F0F0]">
                  {/* Metric */}
                  <span className="text-[10px] font-bold text-[#AAA] uppercase tracking-wider shrink-0">Métrica</span>
                  <div className="flex items-center gap-1">
                    {(['pago_total','empenhado','liquidado'] as const).map(k => (
                      <button key={k} onClick={() => setPivotValueKey(k)}
                        className={cn('px-2.5 py-1 text-[11px] font-bold rounded-md transition-all',
                          pivotValueKey === k ? 'bg-[#118DFF] text-white shadow-sm' : 'bg-[#F3F4F6] text-[#666] hover:bg-[#E5E7EB]')}>
                        {k === 'pago_total' ? 'Pago Total' : k === 'empenhado' ? 'Empenhado' : 'Liquidado'}
                      </button>
                    ))}
                  </div>

                  <div className="w-px h-5 bg-[#E5E5E5] shrink-0" />

                  {/* Expand / Collapse */}
                  <button onClick={() => setPivotExpanded(new Set(allExpandableKeys))}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-[#F3F4F6] text-[#555] rounded-md hover:bg-[#E5E7EB] transition-all shrink-0">
                    + Expandir Tudo
                  </button>
                  <button onClick={() => setPivotExpanded(new Set())}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-[#F3F4F6] text-[#555] rounded-md hover:bg-[#E5E7EB] transition-all shrink-0">
                    − Recolher Tudo
                  </button>

                  <div className="flex-1" />

                  {/* Counter */}
                  <span className="text-[11px] text-[#BBB] font-mono shrink-0">
                    {pivotLoading ? <Spinner size={3} /> : `${fmt(tree.length)} grupos · ${fmt(pivotMultiRaw.length)} combinações`}
                  </span>

                  {/* Export XLSX */}
                  <button onClick={downloadPivotXlsx} disabled={pivotXlsxLoading || !pivotMultiRaw.length}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#217346] text-white text-[11px] font-bold rounded-lg hover:bg-[#1a5c38] disabled:opacity-40 transition-all shadow-sm shrink-0">
                    {pivotXlsxLoading ? <Spinner size={3} /> : <Download className="w-3.5 h-3.5" />}
                    Exportar XLSX
                  </button>

                  {/* Export PDF */}
                  <button onClick={downloadPivotPdf} disabled={!pivotMultiRaw.length}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D64550] text-white text-[11px] font-bold rounded-lg hover:bg-[#b5373f] disabled:opacity-40 transition-all shadow-sm shrink-0">
                    <Download className="w-3.5 h-3.5" />
                    Exportar PDF
                  </button>
                </div>

                {/* Row 2: Campos de linha (ordered dim chips) */}
                <div className="flex items-center gap-2 flex-wrap px-4 py-2.5">
                  <span className="text-[10px] font-bold text-[#AAA] uppercase tracking-wider shrink-0">Campos:</span>

                  {pivotDims.map((dimKey, i) => {
                    const dim = MULTI_PIVOT_DIMS.find(d => d.key === dimKey);
                    const canRemove = pivotDims.length > 1;
                    return (
                      <div key={dimKey}
                        draggable
                        onDragStart={() => { pivotDragIdx.current = i; }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => {
                          const from = pivotDragIdx.current;
                          if (from === null || from === i) return;
                          const n = [...pivotDims];
                          const [moved] = n.splice(from, 1);
                          n.splice(i, 0, moved);
                          setPivotDims(n);
                          setPivotExpanded(new Set());
                          pivotDragIdx.current = null;
                        }}
                        onDragEnd={() => { pivotDragIdx.current = null; }}
                        className="flex items-center gap-1.5 bg-[#EEF4FF] border border-[#C7D8FF] rounded-lg pl-2 pr-1.5 py-1 cursor-grab active:cursor-grabbing select-none">
                        {/* Drag handle visual */}
                        <span className="text-[#93c5fd] text-[10px] font-bold tracking-tight" title="Arraste para reordenar">⠿</span>
                        <span className="text-[11px] font-semibold text-[#1e40af] whitespace-nowrap">{dim?.label ?? dimKey}</span>
                        <button title="Remover campo" disabled={!canRemove}
                          onClick={() => { setPivotDims(pivotDims.filter((_,j) => j !== i)); setPivotExpanded(new Set()); }}
                          className="w-4 h-4 flex items-center justify-center rounded-full text-[#93c5fd] hover:text-red-500 hover:bg-red-50 disabled:opacity-20 text-[11px] font-bold transition-colors cursor-pointer">✕</button>
                      </div>
                    );
                  })}

                  {/* Add dimension */}
                  {availableToAdd.length > 0 && pivotDims.length < 4 && (
                    <select
                      value=""
                      onChange={e => { if (e.target.value) { setPivotDims([...pivotDims, e.target.value]); setPivotExpanded(new Set()); e.currentTarget.value = ''; } }}
                      className="text-[11px] border border-dashed border-[#C7D8FF] rounded-lg px-2.5 py-1 bg-white text-[#1e40af] font-semibold focus:outline-none focus:ring-1 focus:ring-[#118DFF] cursor-pointer">
                      <option value="">+ Adicionar campo…</option>
                      {availableToAdd.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                    </select>
                  )}

                  <div className="flex-1" />

                  {/* Refresh */}
                  <button onClick={loadPivot} disabled={pivotLoading}
                    className="flex items-center gap-1 px-3 py-1 text-[11px] font-semibold bg-[#F3F4F6] text-[#555] rounded-md hover:bg-[#E5E7EB] disabled:opacity-50 transition-all shrink-0">
                    {pivotLoading ? <Spinner size={3} /> : <RefreshCw className="w-3 h-3" />} Atualizar
                  </button>
                </div>
              </div>

              {/* ── Data table ────────────────────────────────────────── */}
              <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-hidden">
                {pivotError ? (
                  <div className="p-5 flex items-start gap-2 text-red-400">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-sm">Erro ao carregar a Tabela Dinâmica</p>
                      <p className="text-xs font-mono mt-0.5 text-[#888]">
                        {pivotError.includes('524') || pivotError.includes('timeout') || pivotError.includes('Turso')
                          ? 'Consulta expirou — volume de dados muito grande. Aplique filtros adicionais (ex: DRS, Grupo) para reduzir o volume.'
                          : pivotError}
                      </p>
                      <button onClick={loadPivot} className="mt-2 px-3 py-1 bg-red-500 text-white text-xs font-bold rounded hover:bg-red-600">Retry</button>
                    </div>
                  </div>
                ) : pivotLoading && !pivotMultiRaw.length ? (
                  <div className="py-16 flex items-center justify-center"><Spinner size={8} /></div>
                ) : (
                  <div className="overflow-auto" style={{ maxHeight: '72vh' }}>
                    <table className="border-collapse w-full" style={{ fontSize: '12px' }}>
                      <thead className="sticky top-0 z-20">
                        <tr style={{ background: '#1a2234' }}>
                          {/* Sticky label column */}
                          <th className="sticky left-0 z-30 px-4 py-3 text-left font-semibold whitespace-nowrap border-r"
                            style={{ minWidth: '280px', background: '#1a2234', color: '#94a3b8', fontSize: '11px', letterSpacing: '0.05em', textTransform: 'uppercase', borderColor: 'rgba(255,255,255,0.08)' }}>
                            {pivotDims.map(k => MULTI_PIVOT_DIMS.find(d => d.key === k)?.label ?? k).join(' / ')}
                          </th>
                          {/* Year columns */}
                          {pivotAnos.map(ano => (
                            <th key={ano} className="px-4 py-3 text-right font-semibold whitespace-nowrap border-r"
                              style={{ minWidth: `${COL_W}px`, color: '#e2e8f0', fontSize: '13px', letterSpacing: '0.03em', borderColor: 'rgba(255,255,255,0.08)' }}>
                              {ano}
                            </th>
                          ))}
                          {/* Total column */}
                          <th className="px-4 py-3 text-right font-bold whitespace-nowrap"
                            style={{ minWidth: `${COL_W}px`, color: '#fbbf24', fontSize: '13px' }}>
                            Total Geral
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {flatRows.map((row, ri) => {
                          const st      = levelStyle(row.level, row.isLeaf, ri);
                          const indent  = row.level * INDENT_PX;
                          const isOpen  = !row.isLeaf && pivotExpanded.has(row.key);
                          const toggleExpand = row.hasChildren ? () => {
                            setPivotExpanded(prev => {
                              const next = new Set(prev);
                              isOpen ? next.delete(row.key) : next.add(row.key);
                              return next;
                            });
                          } : undefined;

                          return (
                            <tr key={row.key}
                              onClick={toggleExpand}
                              style={{ background: st.rowBg, cursor: row.hasChildren ? 'pointer' : 'default' }}>
                              {/* Label cell */}
                              <td className="sticky left-0 z-10 py-2 whitespace-nowrap border-r border-b select-none"
                                style={{
                                  background: st.rowBg, color: st.textColor,
                                  fontWeight: st.fontWeight, fontSize: st.fontSize,
                                  paddingLeft: `${14 + indent}px`, paddingRight: '12px',
                                  borderColor: '#e5eaf2', minWidth: '280px',
                                }}>
                                <span className="flex items-center gap-1.5">
                                  {row.hasChildren ? (
                                    isOpen
                                      ? <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-70" />
                                      : <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-70" />
                                  ) : (
                                    <span style={{ width: '3px', height: '14px', borderRadius: '2px', background: '#93c5fd', flexShrink: 0, display: 'inline-block', marginRight: '2px' }} />
                                  )}
                                  <span className="truncate" style={{ maxWidth: '500px' }} title={row.label}>
                                    {stripNumPrefix(row.label) || '(Vazio)'}
                                  </span>
                                </span>
                              </td>
                              {/* Year cells */}
                              {pivotAnos.map(ano => (
                                <td key={ano} className="px-4 py-2 text-right font-mono whitespace-nowrap border-r border-b"
                                  style={{
                                    color: row.isLeaf ? '#4b5563' : st.textColor,
                                    fontWeight: row.level < 2 ? 600 : 400,
                                    borderColor: '#e5eaf2', letterSpacing: '-0.01em',
                                  }}>
                                  {row.byYear[ano]
                                    ? fmt(row.byYear[ano], 'currency')
                                    : <span style={{ color: '#d1d5db' }}>—</span>}
                                </td>
                              ))}
                              {/* Total cell */}
                              <td className="px-4 py-2 text-right font-mono font-semibold whitespace-nowrap border-b"
                                style={{ color: totalTextColor(row.level, row.isLeaf), borderColor: '#e5eaf2' }}>
                                {fmt(row.total, 'currency')}
                              </td>
                            </tr>
                          );
                        })}

                        {/* Grand total row */}
                        {flatRows.length > 0 && (
                          <tr style={{ background: '#1a2234', borderTop: '2px solid #334155' }}>
                            <td className="sticky left-0 z-10 px-4 py-3 font-bold uppercase tracking-wider whitespace-nowrap"
                              style={{ minWidth: '280px', background: '#1a2234', color: '#94a3b8', fontSize: '11px' }}>
                              Total Geral
                            </td>
                            {pivotAnos.map(ano => (
                              <td key={ano} className="px-4 py-3 text-right font-mono font-bold whitespace-nowrap border-r"
                                style={{ color: '#93c5fd', borderColor: 'rgba(255,255,255,0.08)', letterSpacing: '-0.01em' }}>
                                {fmt(grandByYear[ano] ?? 0, 'currency')}
                              </td>
                            ))}
                            <td className="px-4 py-3 text-right font-mono font-bold whitespace-nowrap"
                              style={{ color: '#fbbf24', letterSpacing: '-0.01em' }}>
                              {fmt(grandTotal, 'currency')}
                            </td>
                          </tr>
                        )}

                        {/* Empty state */}
                        {!pivotLoading && !pivotMultiRaw.length && (
                          <tr>
                            <td colSpan={pivotAnos.length + 2} className="py-16 text-center" style={{ color: '#9ca3af' }}>
                              <Database className="w-8 h-8 mx-auto mb-2 opacity-25" />
                              <p style={{ fontSize: '13px', fontWeight: 500 }}>Nenhum dado encontrado</p>
                              <p style={{ fontSize: '11px', marginTop: '4px' }}>
                                Verifique os filtros aplicados.
                              </p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          );
        })()}



        {/* ---------- TAB: OB ---------- */}
        {activeTab === 'ob' && (
          <div className="max-w-screen-xl mx-auto py-4">
            <ObTab onUploadClick={() => { setPwdInput(''); setPwdError(false); setPwdGateOpen(true); }} />
          </div>
        )}

        {/* ---------- TAB: LEGENDA ---------- */}
        {activeTab === 'legenda' && (
          <div className="max-w-3xl mx-auto py-6 space-y-8">
            <div>
              <h2 className="text-lg font-bold text-[#1B1B1B] mb-1 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#118DFF]" /> Legenda — Conceitos e Definições
              </h2>
              <p className="text-[13px] text-[#666]">Glossário dos termos e conceitos utilizados no painel de controle de despesas.</p>
            </div>

            {/* ── Execução da Despesa Pública ── */}
            <div className="rounded-xl border-2 border-[#118DFF] overflow-hidden shadow-sm">
              {/* Header azul */}
              <div className="bg-[#118DFF] px-5 py-4">
                <h3 className="text-white font-bold text-[15px] mb-0.5">O QUE SIGNIFICA EXECUTAR A DESPESA PÚBLICA?</h3>
                <p className="text-blue-100 text-[12px]">Baseado na Lei nº 4.320/64 · Portal da Transparência do Governo Federal</p>
              </div>

              {/* Texto explicativo */}
              <div className="bg-white px-5 py-4 text-[13px] text-[#444] leading-relaxed space-y-3">
                <p>Significa realizar as despesas previstas no orçamento público, seguindo os <strong>três estágios presentes na Lei nº 4.320/64</strong>: empenho, liquidação e pagamento.</p>
                <p><strong className="text-[#118DFF]">O empenho</strong> é a etapa em que o governo reserva o dinheiro que será pago quando o bem for entregue ou o serviço concluído. Isso ajuda o governo a organizar os gastos pelas diferentes áreas, evitando que se gaste mais do que foi planejado.</p>
                <p><strong className="text-[#1AAB40]">A liquidação</strong> é quando se verifica que o governo recebeu aquilo que comprou. Ou seja, quando se confere que o bem foi entregue corretamente ou que a etapa da obra foi concluída como acordado.</p>
                <p><strong className="text-[#E66C37]">O pagamento</strong> ocorre quando, estando tudo certo com as fases anteriores, o governo repassa o valor ao vendedor ou prestador de serviço contratado.</p>
                <div className="pt-1">
                  <a href="https://portaldatransparencia.gov.br/entenda-a-gestao-publica/execucao-despesa-publica"
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#118DFF] hover:underline text-[12px] font-semibold">
                    <ExternalLink className="w-3.5 h-3.5" /> Saiba mais no Portal da Transparência
                  </a>
                </div>
              </div>

              {/* Infográfico dos 3 estágios */}
              <div className="grid grid-cols-3 divide-x divide-[#E5E5E5] bg-[#F8FBFF]">
                {[
                  {
                    num: '1', label: 'Empenho', color: '#118DFF', bg: '#EEF6FF',
                    desc: 'Fase em que é criada a obrigação de pagamento da despesa pelo governo. O recurso orçamentário é reservado.',
                  },
                  {
                    num: '2', label: 'Liquidação', color: '#1AAB40', bg: '#EDFBF2',
                    desc: 'Etapa em que é cobrada a prestação de serviços, a entrega de bens ou a realização de obras. Envolve todos os atos de verificação e conferência.',
                  },
                  {
                    num: '3', label: 'Pagamento', color: '#E66C37', bg: '#FFF5EE',
                    desc: 'Em que se entrega o dinheiro ao credor, após autoridade competente determinar que a despesa liquidada seja paga.',
                  },
                ].map((s, i) => (
                  <div key={i} className="p-4 flex flex-col items-center text-center gap-2" style={{ background: s.bg }}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md" style={{ background: s.color }}>
                      {s.num}
                    </div>
                    <p className="font-bold text-[13px]" style={{ color: s.color }}>{s.label}</p>
                    <p className="text-[11px] text-[#555] leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>

              {/* YouTube embed */}
              <div className="bg-[#1a1a1a] px-5 py-4">
                <p className="text-white text-[12px] font-semibold mb-3 flex items-center gap-2">
                  <span className="bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">▶ YouTube</span>
                  Assista: Execução da Despesa Pública explicada em vídeo
                </p>
                <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                  <iframe
                    className="absolute top-0 left-0 w-full h-full rounded-lg"
                    src="https://www.youtube.com/embed/ZcqgaEjJ7Aw"
                    title="Execução da Despesa Pública — Empenho, Liquidação e Pagamento"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            </div>

            {/* Fluxo Orçamentário */}
            <Card title="Fluxo Orçamentário" icon={<TrendingUp className="w-4 h-4" />}>
              <div className="flex flex-col sm:flex-row items-stretch gap-0 rounded-lg overflow-hidden border border-[#E5E5E5]">
                {[
                  { step: '1', label: 'Empenho', color: '#118DFF', desc: 'Reserva de recursos no orçamento. Compromisso formal de pagamento.' },
                  { step: '2', label: 'Liquidação', color: '#1AAB40', desc: 'Verificação do direito do credor. Confirmação que o bem foi entregue ou o serviço prestado.' },
                  { step: '3', label: 'Pagamento', color: '#E66C37', desc: 'Transferência efetiva do recurso ao credor. Extinção da obrigação.' },
                ].map((s, i) => (
                  <div key={i} className="flex-1 p-4 flex flex-col items-center text-center gap-2" style={{ background: s.color + '12', borderLeft: i > 0 ? `2px solid ${s.color}30` : undefined }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ background: s.color }}>{s.step}</div>
                    <p className="font-bold text-[#1B1B1B] text-sm">{s.label}</p>
                    <p className="text-[11px] text-[#666] leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Glossário */}
            <Card title="Glossário" icon={<BookOpen className="w-4 h-4" />}>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b-2 border-[#E5E5E5]">
                      <th className="text-left py-2 pr-4 font-bold text-[#333] w-36">Termo</th>
                      <th className="text-left py-2 font-bold text-[#333]">Definição</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F5F5F5]">
                    {[
                      { termo: 'Empenhado',    cor: '#118DFF', def: 'Recurso do orçamento que foi empenhado. Refere-se ao orçamento do ano em questão.' },
                      { termo: 'Liquidado',    cor: '#1AAB40', def: 'Recurso do orçamento que foi liquidado. Refere-se ao orçamento do ano em questão.' },
                      { termo: 'Pago',         cor: '#E66C37', def: 'Recurso do orçamento que foi pago. Refere-se ao orçamento do ano em questão.' },
                      { termo: 'Pago Total',   cor: '#6B007B', def: 'Soma do recurso do orçamento que foi pago no ano em questão e dos recursos de anos anteriores inscritos em restos a pagar.' },
                      { termo: '% Liquidado',  cor: '#1AAB40', def: 'Recurso Liquidado dividido pelo Recurso Empenhado. Refere-se ao orçamento do ano em questão.' },
                      { termo: '% Pago',       cor: '#E66C37', def: 'Recurso Pago dividido pelo Recurso Liquidado. Refere-se ao orçamento do ano em questão.' },
                    ].map((row, i) => (
                      <tr key={i} className="hover:bg-[#FAFAFA]">
                        <td className="py-3 pr-4 align-top">
                          <span className="inline-block px-2 py-0.5 rounded font-bold text-white text-[11px]" style={{ background: row.cor }}>{row.termo}</span>
                        </td>
                        <td className="py-3 text-[#444] leading-relaxed">{row.def}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Filtros e Métricas */}
            <Card title="Métricas e Cores do Mapa" icon={<BarChart3 className="w-4 h-4" />}>
              <div className="space-y-3 text-[12px] text-[#555]">
                <p>O mapa e as tabelas regionais utilizam <strong>% Liquidado (Liquidado / Empenhado)</strong> para colorir as áreas:</p>
                <div className="flex flex-wrap gap-3 mt-2">
                  {[
                    { label: '≥ 80%', color: '#1AAB40', desc: 'Ótimo' },
                    { label: '50–79%', color: '#D9B300', desc: 'Atenção' },
                    { label: '< 50%', color: '#D64550', desc: 'Crítico' },
                    { label: 'Sem dados', color: '#A6A6A6', desc: '—' },
                  ].map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded" style={{ background: c.color }} />
                      <span><strong>{c.label}</strong> — {c.desc}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-[#888]">
                  Os filtros de ano e região funcionam de forma cascateada: selecionar um RRAS filtra automaticamente os municípios disponíveis.
                </p>
              </div>
            </Card>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between py-3 border-t border-[#E5E5E5] text-[10px] text-[#BBB] flex-wrap gap-2">
          <span className="font-mono">lc131_despesas · lc131-api.sessp-css2.workers.dev</span>
          <span>Controle de Despesas · Coordenadoria de Gestão Orçamentária e Financeira · SES/SP · {new Date().getFullYear()}</span>
        </div>
      </main>
      )}

      {uploadOpen && <UploadPanel onClose={() => setUploadOpen(false)} onImportDone={() => { const d = new Date(); try { localStorage.setItem('lc131_lastImportAt', d.toISOString()); } catch {} setLastImportAt(d); setUploadOpen(false); }} />}
      {obUploadOpen && <UploadObPanel onClose={() => setObUploadOpen(false)} onImportDone={() => { setObUploadOpen(false); switchTab('ob'); }} />}

      {/* Password gate modal */}
      {pwdGateOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) { setPwdGateOpen(false); setPwdInput(''); setPwdError(false); } }}>
          <div className="bg-white rounded-xl shadow-2xl w-80 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#118DFF] shrink-0" />
              <p className="font-bold text-[#333] text-sm">Acesso restrito</p>
            </div>
            <p className="text-[11px] text-[#999] -mt-2">Informe a senha para importar LC131 e LisOB.</p>
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
