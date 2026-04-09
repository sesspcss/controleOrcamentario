import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const target = join(__dirname, '..', 'src', 'App.tsx');

const content = String.raw`/**
 * LC 131 — Dashboard Unificado v2
 * Filtros cascateados, gráficos corrigidos, mais dimensões de análise.
 */

import React, { useEffect, useState, useRef, useCallback, memo } from 'react';
import { supabase } from './supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend, RadialBarChart, RadialBar,
} from 'recharts';
import {
  RefreshCw, AlertCircle, DollarSign, TrendingUp, CheckCircle2,
  Download, Filter, X, Upload, FileSpreadsheet,
  ChevronLeft, ChevronRight, ChevronDown, Settings, Activity,
  Database, BarChart3, Search, SlidersHorizontal,
  Building2, MapPin, Layers, Percent, Zap,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ─── Utility ───────────────────────────────────────────────────────────────────
function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

function fmt(val: number | null | undefined, type: 'currency' | 'number' | 'compact' = 'number'): string {
  if (val === null || val === undefined || isNaN(Number(val))) return '–';
  const n = Number(val);
  if (type === 'currency') return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  if (type === 'compact') {
    if (n >= 1e9) return 'R\$ ' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return 'R\$ ' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return 'R\$ ' + (n / 1e3).toFixed(0) + 'k';
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
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ─── Colors ────────────────────────────────────────────────────────────────────
const CHART_COLORS = [
  '#6366F1','#F59E0B','#10B981','#3B82F6','#EC4899',
  '#8B5CF6','#14B8A6','#F97316','#06B6D4','#84CC16',
  '#EF4444','#A78BFA','#34D399','#60A5FA','#FBBF24',
  '#FB7185','#7DD3FC','#FDE68A','#D9F99D','#BFDBFE',
];

// ─── Types ──────────────────────────────────────────────────────────────────────
type DataRow = Record<string, unknown>;
interface KPIs { empenhado: number; liquidado: number; pago: number; pago_total: number; total: number; municipios: number }
interface AnoRow { ano: number; empenhado: number; liquidado: number; pago_total: number; registros: number }
interface DrsRow { drs: string; empenhado: number; liquidado: number; pago_total: number }
interface GrupoRow { grupo_despesa: string; empenhado: number; liquidado: number; pago_total: number }
interface MunicRow { municipio: string; empenhado: number; pago_total: number }
interface FonteRow { fonte_recurso: string; empenhado: number; pago_total: number }
interface ElementoRow { elemento: string; empenhado: number; pago_total: number }
interface RegiaoAdRow { regiao_ad: string; empenhado: number; pago_total: number }
interface UoRow { uo: string; empenhado: number; liquidado: number; pago_total: number }

interface CachedData {
  kpis: KPIs;
  porAno: AnoRow[];
  porDrs: DrsRow[];
  porGrupo: GrupoRow[];
  porMunic: MunicRow[];
  porFonte: FonteRow[];
  porElemento: ElementoRow[];
  porRegiaoAd: RegiaoAdRow[];
  porUo: UoRow[];
}

type DetailFilterKey = 'p_drs'|'p_regiao_ad'|'p_rras'|'p_regiao_sa'|'p_municipio'|'p_grupo_despesa'|'p_tipo_despesa'|'p_rotulo'|'p_fonte_recurso'|'p_codigo_ug';

const FILTER_META: { key: DetailFilterKey; label: string; distinctKey: string }[] = [
  { key: 'p_drs',           label: 'DRS',               distinctKey: 'distinct_drs'       },
  { key: 'p_regiao_ad',     label: 'Região Admin.',      distinctKey: 'distinct_regiao_ad' },
  { key: 'p_municipio',     label: 'Município',          distinctKey: 'distinct_municipio' },
  { key: 'p_rras',          label: 'RRAS',               distinctKey: 'distinct_rras'      },
  { key: 'p_regiao_sa',     label: 'Região de Saúde',    distinctKey: 'distinct_regiao_sa' },
  { key: 'p_grupo_despesa', label: 'Grupo Despesa',      distinctKey: 'distinct_grupo'     },
  { key: 'p_tipo_despesa',  label: 'Tipo Despesa',       distinctKey: 'distinct_tipo'      },
  { key: 'p_rotulo',        label: 'Rótulo',             distinctKey: 'distinct_rotulo'    },
  { key: 'p_fonte_recurso', label: 'Fonte Recurso',      distinctKey: 'distinct_fonte'     },
  { key: 'p_codigo_ug',     label: 'Código UG',          distinctKey: 'distinct_codigo_ug' },
];

interface DetailRow {
  id: number; ano_referencia: number;
  drs: string; regiao_ad: string; rras: string; regiao_sa: string;
  cod_ibge: string; municipio: string;
  codigo_nome_uo: string; codigo_nome_ug: string; codigo_ug: string;
  codigo_nome_projeto_atividade: string;
  codigo_nome_fonte_recurso: string; fonte_recurso: string;
  codigo_nome_grupo: string; grupo_despesa: string;
  codigo_nome_elemento: string; codigo_elemento: string;
  tipo_despesa: string; rotulo: string;
  codigo_nome_favorecido: string; codigo_favorecido: string;
  empenhado: number; liquidado: number; pago: number;
  pago_anos_anteriores: number; pago_total: number;
}

const TABLE_COLS: { key: keyof DetailRow; label: string; numeric?: boolean; w: string }[] = [
  { key: 'ano_referencia',                label: 'Ano',          w: '56px'  },
  { key: 'drs',                           label: 'DRS',          w: '200px' },
  { key: 'municipio',                     label: 'Município',    w: '150px' },
  { key: 'regiao_ad',                     label: 'Reg. Admin.',  w: '140px' },
  { key: 'rras',                          label: 'RRAS',         w: '100px' },
  { key: 'regiao_sa',                     label: 'Reg. Saúde',   w: '140px' },
  { key: 'codigo_nome_ug',                label: 'UG',           w: '220px' },
  { key: 'codigo_nome_uo',                label: 'UO',           w: '220px' },
  { key: 'codigo_nome_projeto_atividade', label: 'Proj. Ativ.',  w: '220px' },
  { key: 'codigo_nome_fonte_recurso',     label: 'Fonte',        w: '200px' },
  { key: 'fonte_recurso',                 label: 'T. Recurso',   w: '140px' },
  { key: 'codigo_nome_grupo',             label: 'Grupo',        w: '200px' },
  { key: 'grupo_despesa',                 label: 'T. Grupo',     w: '140px' },
  { key: 'codigo_nome_elemento',          label: 'Elemento',     w: '200px' },
  { key: 'codigo_elemento',               label: 'Cód. Elem.',   w: '100px' },
  { key: 'tipo_despesa',                  label: 'Tipo Desp.',   w: '140px' },
  { key: 'rotulo',                        label: 'Rótulo',       w: '140px' },
  { key: 'codigo_nome_favorecido',        label: 'Favorecido',   w: '220px' },
  { key: 'codigo_favorecido',             label: 'CNPJ',         w: '130px' },
  { key: 'empenhado',         label: 'Empenhado',         numeric: true, w: '140px' },
  { key: 'liquidado',         label: 'Liquidado',         numeric: true, w: '140px' },
  { key: 'pago',              label: 'Pago Exerc.',       numeric: true, w: '140px' },
  { key: 'pago_anos_anteriores', label: 'Pago Ant.',      numeric: true, w: '140px' },
  { key: 'pago_total',        label: 'Pago Total',        numeric: true, w: '140px' },
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

// ─── Spinner ───────────────────────────────────────────────────────────────────
function Spinner({ size = 4 }: { size?: number }) {
  return <RefreshCw className={'w-' + size + ' h-' + size + ' animate-spin text-indigo-500'} />;
}

// ─── Tooltip ───────────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-2xl rounded-xl px-3 py-2.5 text-xs min-w-[150px] max-w-xs">
      {label && <p className="font-bold text-gray-700 mb-1.5 text-[11px] border-b border-gray-100 pb-1 truncate">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-3 mt-0.5">
          <span className="flex items-center gap-1.5 text-gray-500">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            <span className="truncate max-w-[90px]">{p.name}</span>
          </span>
          <span className="font-bold text-gray-900 shrink-0">{typeof p.value === 'number' ? fmt(p.value, 'compact') : p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ─── KPI Card ──────────────────────────────────────────────────────────────────
interface KpiCardProps { label: string; value: string; sub?: string; icon: React.ReactNode; accent: string; iconColor: string; trend?: number; }
const KpiCard = memo(({ label, value, sub, icon, accent, iconColor, trend }: KpiCardProps) => (
  <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 relative overflow-hidden group cursor-default">
    <div className="relative z-10">
      <div className={cn('inline-flex items-center justify-center w-11 h-11 rounded-2xl mb-3 shadow-sm', accent)}>
        <span className={iconColor}>{icon}</span>
      </div>
      <p className="text-2xl font-extrabold text-gray-900 tracking-tight leading-none">{value}</p>
      <p className="text-[11px] font-semibold text-gray-400 mt-1.5 uppercase tracking-wide">{label}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      {trend !== undefined && (
        <div className={cn('absolute top-4 right-4 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full',
          trend >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500')}>
          <Percent className="w-2.5 h-2.5" />{Math.abs(trend).toFixed(1)}
        </div>
      )}
    </div>
  </div>
));

// ─── Section Card ──────────────────────────────────────────────────────────────
function SectionCard({ title, badge, children, noPad, icon }: {
  title: string; badge?: React.ReactNode; children: React.ReactNode; noPad?: boolean; icon?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2.5">
        {icon && <span className="text-gray-300">{icon}</span>}
        <p className="font-bold text-gray-800 text-sm flex-1">{title}</p>
        {badge}
      </div>
      {noPad ? children : <div className="p-4 sm:p-5">{children}</div>}
    </div>
  );
}

// ─── Filter Select ─────────────────────────────────────────────────────────────
function FilterSelect({ label, options, value, onChange, loading }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void; loading?: boolean; key?: React.Key;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wide truncate flex items-center gap-1">
        {label}
        {loading && <RefreshCw className="w-2.5 h-2.5 animate-spin text-indigo-400" />}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={loading && options.length === 0}
          className={cn('w-full appearance-none text-xs border rounded-xl px-3 py-2 pr-7 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all cursor-pointer bg-white',
            value ? 'border-indigo-300 bg-indigo-50 text-indigo-900 font-semibold' : 'border-gray-200 text-gray-600 hover:border-indigo-200',
            loading && options.length === 0 && 'opacity-50 cursor-wait')}
        >
          <option value="">Todos ({options.length})</option>
          {options.filter(Boolean).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

// ─── Upload Panel ──────────────────────────────────────────────────────────────
function UploadPanel({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<UploadStep>('idle');
  const [rows, setRows] = useState<DataRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(false);
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
        raw = (XLSX.utils.sheet_to_json(ws, { defval: '' }) as DataRow[]).map(r => {
          const n: DataRow = {};
          Object.keys(r).forEach(k => { n[k.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')] = (r as Record<string,unknown>)[k]; });
          return n;
        });
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
      await supabase.from('lc131_despesas').delete().not('id','is',null);
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await supabase.from('lc131_despesas').insert(rows.slice(i, i + CHUNK));
        if (error) throw error;
        uploaded += Math.min(CHUNK, rows.length - i);
        setProgress(Math.round((uploaded / rows.length) * 100));
      }
      setMessage(uploaded.toLocaleString('pt-BR') + ' registros importados!'); setStep('done');
    } catch (e: unknown) { setMessage((e as Error).message); setStep('error'); }
  };

  const reset = () => { setStep('idle'); setRows([]); setFileName(''); setProgress(0); setMessage(''); setConfirm(false); };
  const cols = rows.length ? Object.keys(rows[0]) : [];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-lg h-full bg-white shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Upload className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Importar LC 131</p>
              <p className="text-xs text-gray-400">Substitui todos os registros</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-200 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {dbCount !== null && (
            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2"><Database className="w-4 h-4 text-slate-400" /><span className="text-xs text-slate-600">Registros no banco</span></div>
              <span className="font-bold text-sm font-mono text-slate-800">{dbCount.toLocaleString('pt-BR')}</span>
            </div>
          )}
          {step === 'idle' && (
            <div onDrop={e => { e.preventDefault(); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]); }}
              onDragOver={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
              className="bg-gradient-to-br from-indigo-50 to-blue-50 border-2 border-dashed border-indigo-200 rounded-2xl p-10 flex flex-col items-center gap-4 cursor-pointer hover:border-indigo-400 transition-all group">
              <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center group-hover:shadow-md transition-shadow">
                <FileSpreadsheet className="w-7 h-7 text-indigo-400" />
              </div>
              <div className="text-center">
                <p className="font-bold text-gray-700">Arraste ou clique para selecionar</p>
                <p className="text-xs text-gray-400 mt-1">.xlsx ou .csv</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </div>
          )}
          {step === 'parsing' && <div className="flex flex-col items-center gap-4 py-12"><Spinner size={8} /><p className="text-sm text-gray-500">Processando arquivo...</p></div>}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-amber-800 text-sm">Substituição total</p>
                  <p className="text-xs text-amber-700 mt-1">
                    <strong>{dbCount?.toLocaleString('pt-BR') ?? '?'}</strong> registros serão substituídos por{' '}
                    <strong>{rows.length.toLocaleString('pt-BR')}</strong> de <span className="font-mono">{fileName}</span>.
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">Colunas ({cols.length})</p>
                <div className="flex flex-wrap gap-1.5">{cols.slice(0,20).map(c => <span key={c} className="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-mono rounded-lg">{c}</span>)}</div>
                {cols.length > 20 && <p className="text-[10px] text-gray-400 mt-1">+{cols.length - 20} mais...</p>}
              </div>
              {!confirm ? (
                <div className="flex gap-2 pt-2">
                  <button onClick={reset} className="flex-1 py-2.5 text-sm font-semibold text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Cancelar</button>
                  <button onClick={handleUpload} className="flex-1 py-2.5 text-sm font-bold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors shadow-sm">Confirmar Import</button>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                  <p className="font-bold text-red-800 text-sm">Tem certeza? Esta ação é irreversível.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirm(false)} className="flex-1 py-2 text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg bg-white">Cancelar</button>
                    <button onClick={handleUpload} className="flex-1 py-2 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700">Confirmar</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {step === 'uploading' && (
            <div className="space-y-4 py-6">
              <div className="flex items-center gap-3 justify-center"><Spinner size={6} /><p className="text-sm text-gray-600">Enviando... {progress}%</p></div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: progress + '%' }} />
              </div>
            </div>
          )}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <div><p className="font-bold text-gray-900">Importação concluída!</p><p className="text-sm text-gray-500 mt-1">{message}</p></div>
              <button onClick={reset} className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700">Importar outro</button>
            </div>
          )}
          {step === 'error' && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <AlertCircle className="w-12 h-12 text-red-300" />
              <div><p className="font-bold text-red-800">Erro</p><p className="text-sm text-red-500 mt-1 font-mono">{message}</p></div>
              <button onClick={reset} className="px-5 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl">Tentar novamente</button>
            </div>
          )}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-slate-700 flex items-center gap-2"><Settings className="w-3.5 h-3.5" />Dicas</p>
            <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
              <li>Cabeçalhos em minúsculas, sem espaços (usar _)</li>
              <li>Modo SUBSTITUIR para dados diários LC 131</li>
              <li>VACUUM no Supabase após grandes importações</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HBar Chart (reusable horizontal bar) ─────────────────────────────────────
function HBarChart({ data, xKey, labelKey, height = 320, colorOffset = 0 }: {
  data: Record<string, unknown>[]; xKey: string; labelKey: string; height?: number; colorOffset?: number;
}) {
  if (!data?.length) return (
    <div className="flex flex-col items-center justify-center h-32 text-gray-300">
      <Database className="w-7 h-7 mb-1.5 opacity-40" />
      <p className="text-xs">Sem dados</p>
    </div>
  );
  return (
    <div style={{ height }} className="overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 24, top: 2, bottom: 2 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
          <XAxis type="number" tick={{ fontSize: 9, fill: '#94A3B8' }} tickFormatter={fmtAxis} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={labelKey} width={148} axisLine={false} tickLine={false}
            tick={{ fontSize: 9, fill: '#475569' }}
            tickFormatter={v => shortLabel(String(v), 22)} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey={xKey} name="Empenhado" radius={[0, 5, 5, 0]} maxBarSize={14}>
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[(i + colorOffset) % CHART_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string|null>(null);
  const [viewMissing, setViewMissing]     = useState(false);
  const [uploadOpen, setUploadOpen]       = useState(false);
  const cacheRef = useRef<Map<number|'todos', CachedData>>(new Map());
  const [data, setData]                   = useState<CachedData|null>(null);

  const [anoSel, setAnoSel]               = useState<number|'todos'>('todos');
  const [filters, setFilters]             = useState<Partial<Record<DetailFilterKey, string>>>({});
  const [distincts, setDistincts]         = useState<Record<string, string[]>>({});
  const [distinctsLoading, setDistinctsLoading] = useState(false);
  const [filtersOpen, setFiltersOpen]     = useState(false);
  const [availableAnos, setAvailableAnos] = useState<number[]>([]);

  const [detailRows, setDetailRows]       = useState<DetailRow[]>([]);
  const [detailTotal, setDetailTotal]     = useState(0);
  const [detailPage, setDetailPage]       = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError]     = useState<string|null>(null);
  const [tableVisible, setTableVisible]   = useState(false);
  const [tableSearch, setTableSearch]     = useState('');
  const DETAIL_PAGE_SIZE = 200;

  // ── Load dashboard with cache ──
  const loadDashboard = useCallback(async (ano: number | 'todos') => {
    if (cacheRef.current.has(ano)) { setData(cacheRef.current.get(ano)!); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const { data: rpc, error: rpcErr } = ano === 'todos'
        ? await supabase.rpc('lc131_dashboard', {})
        : await supabase.rpc('lc131_dashboard', { p_ano: Number(ano) });
      if (rpcErr) {
        if (rpcErr.code === 'PGRST202' || rpcErr.message?.includes('does not exist')) { setViewMissing(true); setLoading(false); return; }
        throw new Error(rpcErr.code + ': ' + rpcErr.message);
      }
      const d = rpc as Record<string, unknown>;
      const kpis_raw = d.kpis as Record<string, unknown> ?? {};
      const parsed: CachedData = {
        kpis: {
          empenhado: Number(kpis_raw.empenhado ?? 0),
          liquidado: Number(kpis_raw.liquidado ?? 0),
          pago: Number(kpis_raw.pago ?? 0),
          pago_total: Number(kpis_raw.pago_total ?? 0),
          total: Number(kpis_raw.total ?? 0),
          municipios: Number(kpis_raw.municipios ?? 0),
        },
        porAno: ((d.por_ano as Record<string,unknown>[] ?? [])).map(r => ({
          ano: Number(r.ano), empenhado: Number(r.empenhado ?? 0), liquidado: Number(r.liquidado ?? 0),
          pago_total: Number(r.pago_total ?? 0), registros: Number(r.registros ?? 0),
        })).sort((a, b) => a.ano - b.ano),
        porDrs: ((d.por_drs as Record<string,unknown>[] ?? [])).map(r => ({
          drs: String(r.drs), empenhado: Number(r.empenhado ?? 0), liquidado: Number(r.liquidado ?? 0), pago_total: Number(r.pago_total ?? 0),
        })),
        porGrupo: ((d.por_grupo as Record<string,unknown>[] ?? [])).map(r => ({
          grupo_despesa: String(r.grupo_despesa), empenhado: Number(r.empenhado ?? 0),
          liquidado: Number(r.liquidado ?? 0), pago_total: Number(r.pago_total ?? 0),
        })),
        porMunic: ((d.por_municipio as Record<string,unknown>[] ?? [])).map(r => ({
          municipio: String(r.municipio), empenhado: Number(r.empenhado ?? 0), pago_total: Number(r.pago_total ?? 0),
        })),
        porFonte: ((d.por_fonte as Record<string,unknown>[] ?? [])).map(r => ({
          fonte_recurso: String(r.fonte_recurso), empenhado: Number(r.empenhado ?? 0), pago_total: Number(r.pago_total ?? 0),
        })),
        porElemento: ((d.por_elemento as Record<string,unknown>[] ?? [])).map(r => ({
          elemento: String(r.elemento), empenhado: Number(r.empenhado ?? 0), pago_total: Number(r.pago_total ?? 0),
        })),
        porRegiaoAd: ((d.por_regiao_ad as Record<string,unknown>[] ?? [])).map(r => ({
          regiao_ad: String(r.regiao_ad), empenhado: Number(r.empenhado ?? 0), pago_total: Number(r.pago_total ?? 0),
        })),
        porUo: ((d.por_uo as Record<string,unknown>[] ?? [])).map(r => ({
          uo: String(r.uo), empenhado: Number(r.empenhado ?? 0), liquidado: Number(r.liquidado ?? 0), pago_total: Number(r.pago_total ?? 0),
        })),
      };
      cacheRef.current.set(ano, parsed);
      if (ano === 'todos') setAvailableAnos(parsed.porAno.map(r => r.ano));
      setData(parsed);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);

  const prefetchAll = useCallback(async (anos: number[]) => {
    for (const ano of anos) if (!cacheRef.current.has(ano)) await loadDashboard(ano);
  }, [loadDashboard]);

  useEffect(() => { loadDashboard('todos'); }, []);
  useEffect(() => { if (availableAnos.length > 0) prefetchAll(availableAnos); }, [availableAnos]);
  useEffect(() => { loadDashboard(anoSel); }, [anoSel]);

  // ── Load cascading distincts (called on every filter change) ──
  const loadDistincts = useCallback(async (currentFilters: Partial<Record<DetailFilterKey, string>>, ano: number | 'todos') => {
    setDistinctsLoading(true);
    try {
      const params: Record<string, unknown> = { p_limit: 0, p_offset: 0 };
      if (ano !== 'todos') params.p_ano = Number(ano);
      Object.entries(currentFilters).forEach(([k, v]) => { if (v?.trim()) params[k] = v.trim(); });
      const { data: rpc } = await supabase.rpc('lc131_detail', params);
      const d = rpc as Record<string, string[]>;
      setDistincts({
        distinct_drs:       d?.distinct_drs       ?? [],
        distinct_regiao_ad: d?.distinct_regiao_ad ?? [],
        distinct_rras:      d?.distinct_rras      ?? [],
        distinct_regiao_sa: d?.distinct_regiao_sa ?? [],
        distinct_municipio: d?.distinct_municipio ?? [],
        distinct_grupo:     d?.distinct_grupo     ?? [],
        distinct_tipo:      d?.distinct_tipo      ?? [],
        distinct_rotulo:    d?.distinct_rotulo    ?? [],
        distinct_fonte:     d?.distinct_fonte     ?? [],
        distinct_codigo_ug: d?.distinct_codigo_ug ?? [],
      });
    } catch { /* silent */ }
    finally { setDistinctsLoading(false); }
  }, []);

  // ── Load detail ──
  const loadDetail = useCallback(async (page: number, search = '') => {
    setDetailLoading(true); setDetailError(null);
    try {
      const params: Record<string, unknown> = { p_limit: DETAIL_PAGE_SIZE, p_offset: page * DETAIL_PAGE_SIZE };
      if (anoSel !== 'todos') params.p_ano = Number(anoSel);
      FILTER_META.forEach(f => { const v = filters[f.key]; if (v?.trim()) params[f.key] = v.trim(); });
      if (search.trim()) params.p_codigo_ug = search.trim();
      const { data: rpc, error: rpcErr } = await supabase.rpc('lc131_detail', params);
      if (rpcErr) throw new Error(rpcErr.message);
      const d = rpc as { total: number; rows: DetailRow[] } & Record<string, string[]>;
      setDetailTotal(d.total ?? 0); setDetailRows(d.rows ?? []); setDetailPage(page);
    } catch (e: unknown) { setDetailError((e as Error).message); }
    finally { setDetailLoading(false); }
  }, [anoSel, filters]);

  // Debounced detail reload on filter/year change
  const detailDebounce = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!tableVisible) return;
    clearTimeout(detailDebounce.current);
    detailDebounce.current = setTimeout(() => loadDetail(0, tableSearch), 400);
    return () => clearTimeout(detailDebounce.current);
  }, [filters, anoSel, tableVisible]);

  const toggleTable = () => {
    if (!tableVisible) { loadDetail(0, tableSearch); if (Object.keys(distincts).length === 0) loadDistincts(filters, anoSel); }
    setTableVisible(v => !v);
  };

  const setFilter = (key: DetailFilterKey, val: string) => {
    const newFilters = { ...filters };
    if (val) newFilters[key] = val; else delete newFilters[key];
    setFilters(newFilters);
    loadDistincts(newFilters, anoSel);
  };
  const clearFilters = () => { setFilters({}); loadDistincts({}, anoSel); };
  const activeFilters = Object.values(filters).filter(Boolean).length;

  const openFilters = () => {
    setFiltersOpen(true);
    if (Object.keys(distincts).length === 0) loadDistincts(filters, anoSel);
  };

  const handleRefresh = () => { cacheRef.current.clear(); setData(null); loadDashboard(anoSel); };

  const exportCSV = () => {
    if (!detailRows.length) return;
    const headers = TABLE_COLS.map(c => c.label).join(',');
    const body = detailRows.map(r => TABLE_COLS.map(c => '"' + String(r[c.key] ?? '').replace(/"/g,'""') + '"').join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + headers + '\n' + body], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = 'lc131_' + anoSel + '.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const kpis = data?.kpis;
  const pctLiq  = kpis && kpis.empenhado > 0 ? (kpis.liquidado / kpis.empenhado) * 100 : 0;
  const pctPago = kpis && kpis.empenhado > 0 ? (kpis.pago_total / kpis.empenhado) * 100 : 0;

  if (viewMissing) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-amber-100 p-8 max-w-md w-full space-y-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-gray-900">Setup necessário</p>
            <p className="text-sm text-gray-500 mt-1">Execute <code className="bg-gray-100 px-1 rounded text-xs">scripts/supabase_setup.sql</code> no Supabase SQL Editor.</p>
          </div>
        </div>
        <button onClick={handleRefresh} className="w-full py-2.5 bg-amber-500 text-white text-sm font-bold rounded-xl hover:bg-amber-600 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4" /> Verificar novamente
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F6F7FB]">

      {/* ════════════════════════════════════════ TOPBAR ════════ */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-lg border-b border-gray-100 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-200/50">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <div className="hidden sm:block">
              <p className="font-extrabold text-gray-900 text-sm leading-tight">LC 131</p>
              <p className="text-[10px] text-gray-400 leading-tight">Controle Orçamentário · SP</p>
            </div>
          </div>

          {/* Year tabs */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-xl p-1 overflow-x-auto">
            <button onClick={() => setAnoSel('todos')} className={cn('px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-all',
              anoSel === 'todos' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-700')}>Todos</button>
            {availableAnos.map(a => (
              <button key={a} onClick={() => setAnoSel(a)} className={cn('px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-all',
                anoSel === a ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-700')}>{a}</button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={filtersOpen ? () => setFiltersOpen(false) : openFilters}
              className={cn('flex items-center gap-1.5 px-3 h-8 rounded-xl text-xs font-bold transition-all border',
                filtersOpen || activeFilters > 0 ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300')}>
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Filtros</span>
              {activeFilters > 0 && <span className="bg-white text-indigo-700 text-[10px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center">{activeFilters}</span>}
            </button>
            <button onClick={handleRefresh} title="Atualizar"
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-gray-200 hover:border-gray-300 text-gray-500 transition-colors">
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            </button>
            <button onClick={() => setUploadOpen(true)}
              className="flex items-center gap-1.5 px-3 h-8 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200/50">
              <Upload className="w-3.5 h-3.5" /><span className="hidden sm:inline">Importar</span>
            </button>
          </div>
        </div>
      </header>

      {/* ════════════════════════════════════════ FILTER BAR ════ */}
      {filtersOpen && (
        <div className="sticky top-14 z-30 bg-white border-b border-gray-100 shadow-md">
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-10 gap-2">
              {FILTER_META.map(f => {
                const opts = (distincts[f.distinctKey] ?? []) as string[];
                const val: string = filters[f.key] ?? '';
                return (
                  <FilterSelect key={f.key} label={f.label} options={opts} value={val}
                    onChange={(v: string) => setFilter(f.key, v)} loading={distinctsLoading && opts.length === 0} />
                );
              })}
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-[10px] text-gray-400">Os filtros são cascateados — cada lista mostra apenas valores existentes nos registros filtrados.</p>
              {activeFilters > 0 && (
                <button onClick={clearFilters} className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 font-semibold transition-colors">
                  <X className="w-3.5 h-3.5" /> Limpar ({activeFilters})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════ MAIN ══════════ */}
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1"><p className="font-bold text-red-700 text-sm">Erro ao carregar dados</p><p className="text-xs text-red-400 mt-0.5 font-mono">{error}</p></div>
            <button onClick={handleRefresh} className="px-3 py-1.5 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3" /> Tentar novamente</button>
          </div>
        )}

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {loading && !data
            ? [...Array(4)].map((_, i) => <div key={i} className="bg-white rounded-2xl border border-gray-100 h-[112px] animate-pulse" />)
            : kpis ? (
              <>
                <KpiCard label="Total Empenhado"    value={fmt(kpis.empenhado, 'compact')} sub={fmt(kpis.total) + ' registros'}  icon={<DollarSign className="w-5 h-5" />} accent="bg-indigo-100" iconColor="text-indigo-600" />
                <KpiCard label="Total Liquidado"    value={fmt(kpis.liquidado, 'compact')} sub={pctLiq.toFixed(1) + '% do empenh.'} icon={<CheckCircle2 className="w-5 h-5" />} accent="bg-emerald-100" iconColor="text-emerald-600" trend={pctLiq - 100} />
                <KpiCard label="Total Pago"         value={fmt(kpis.pago_total, 'compact')} sub={pctPago.toFixed(1) + '% do empenh.'} icon={<TrendingUp className="w-5 h-5" />} accent="bg-amber-100" iconColor="text-amber-600" trend={pctPago - 100} />
                <KpiCard label="UGs / Municípios"   value={fmt(kpis.municipios)} sub={(data?.porDrs.length ?? 0) + ' DRS · ' + (data?.porRegiaoAd.length ?? 0) + ' regiões'} icon={<Building2 className="w-5 h-5" />} accent="bg-purple-100" iconColor="text-purple-600" />
              </>
            ) : null}
        </div>

        {/* ── Execução resumida (radial gauge) ── */}
        {kpis && kpis.empenhado > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Liquidado / Empenhado', pct: pctLiq, fill: '#10B981', bg: 'bg-emerald-50', text: 'text-emerald-700' },
              { label: 'Pago / Empenhado',      pct: pctPago, fill: '#6366F1', bg: 'bg-indigo-50', text: 'text-indigo-700' },
              { label: 'Pago / Liquidado',      pct: kpis.liquidado > 0 ? (kpis.pago_total / kpis.liquidado) * 100 : 0, fill: '#F59E0B', bg: 'bg-amber-50', text: 'text-amber-700' },
            ].map((g, i) => (
              <div key={i} className={cn('rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-5', g.bg)}>
                <div className="shrink-0 w-16 h-16 overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="100%" startAngle={90} endAngle={90 - (g.pct / 100) * 360} data={[{ value: g.pct }]}>
                      <RadialBar dataKey="value" fill={g.fill} background={{ fill: '#F1F5F9' }} cornerRadius={4} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                </div>
                <div>
                  <p className={cn('text-2xl font-extrabold', g.text)}>{g.pct.toFixed(1)}%</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 font-semibold uppercase tracking-wide">{g.label}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Evolução Anual ── */}
        {data && data.porAno.length > 1 && (
          <SectionCard title="Evolução Anual — Empenhado / Liquidado / Pago" icon={<Activity className="w-4 h-4" />}>
            <div className="h-60 overflow-hidden">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.porAno} margin={{ left: 10, right: 10, top: 4 }}>
                  <defs>
                    {[['gE','#6366F1'],['gL','#10B981'],['gP','#F59E0B']].map(([id, c]) => (
                      <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={c} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={c} stopOpacity={0.01} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="ano" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} tickFormatter={fmtAxis} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#64748B' }} />
                  <Area type="monotone" dataKey="empenhado" name="Empenhado" stroke="#6366F1" fill="url(#gE)" strokeWidth={2.5} dot={false} />
                  <Area type="monotone" dataKey="liquidado"  name="Liquidado"  stroke="#10B981" fill="url(#gL)" strokeWidth={2.5} dot={false} />
                  <Area type="monotone" dataKey="pago_total" name="Pago Total" stroke="#F59E0B" fill="url(#gP)" strokeWidth={2.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        )}

        {/* ── DRS + Região Adm ── */}
        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Empenhado por DRS" icon={<MapPin className="w-4 h-4" />}
              badge={<span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">{data.porDrs.length}</span>}>
              <HBarChart data={data.porDrs as unknown as Record<string,unknown>[]} xKey="empenhado" labelKey="drs" height={420} colorOffset={0} />
            </SectionCard>
            <SectionCard title="Empenhado por Região Administrativa" icon={<Layers className="w-4 h-4" />}
              badge={<span className="text-[10px] font-bold text-purple-500 bg-purple-50 px-2 py-0.5 rounded-full">{data.porRegiaoAd.length}</span>}>
              <HBarChart data={data.porRegiaoAd as unknown as Record<string,unknown>[]} xKey="empenhado" labelKey="regiao_ad" height={420} colorOffset={5} />
            </SectionCard>
          </div>
        )}

        {/* ── Grupo Despesa (donut + HBar) ── */}
        {data && data.porGrupo.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Donut – 2 cols */}
            <div className="lg:col-span-2">
              <SectionCard title="Grupos de Despesa — Distribuição" icon={<Zap className="w-4 h-4" />}>
                <div className="h-52 overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.porGrupo} cx="50%" cy="50%" outerRadius={90} innerRadius={44}
                        dataKey="empenhado" nameKey="grupo_despesa" paddingAngle={2}>
                        {data.porGrupo.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="none" />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col gap-1.5 mt-1">
                  {data.porGrupo.slice(0,8).map((g, i) => {
                    const tot = data.porGrupo.reduce((s, r) => s + r.empenhado, 0);
                    const pct = tot > 0 ? (g.empenhado / tot) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-[10px] text-gray-500 flex-1 truncate" title={g.grupo_despesa}>{shortLabel(g.grupo_despesa, 30)}</span>
                        <span className="text-[10px] font-bold text-gray-500 shrink-0">{pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
            </div>
            {/* Empenhado vs Pago – 3 cols */}
            <div className="lg:col-span-3">
              <SectionCard title="Grupos — Empenhado vs Liquidado vs Pago" icon={<BarChart3 className="w-4 h-4" />}>
                <div className="h-80 overflow-hidden">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.porGrupo.slice(0,10)} layout="vertical" margin={{ left: 0, right: 20, top: 2, bottom: 2 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                      <XAxis type="number" tick={{ fontSize: 9, fill: '#94A3B8' }} tickFormatter={fmtAxis} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="grupo_despesa" width={155} axisLine={false} tickLine={false}
                        tick={{ fontSize: 9, fill: '#475569' }} tickFormatter={v => shortLabel(String(v), 24)} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 10, color: '#64748B' }} />
                      <Bar dataKey="empenhado" name="Empenhado" fill="#6366F1" radius={[0,3,3,0]} maxBarSize={9} />
                      <Bar dataKey="liquidado"  name="Liquidado"  fill="#10B981" radius={[0,3,3,0]} maxBarSize={9} />
                      <Bar dataKey="pago_total" name="Pago Total" fill="#F59E0B" radius={[0,3,3,0]} maxBarSize={9} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            </div>
          </div>
        )}

        {/* ── Municípios + Fonte Recurso ── */}
        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Top Municípios — Empenhado" icon={<MapPin className="w-4 h-4" />}
              badge={<span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">Top {data.porMunic.length}</span>}>
              <div className="h-64 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.porMunic.slice(0,12)} margin={{ left: 6, right: 10, top: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="municipio" tick={{ fontSize: 8, fill: '#94A3B8' }} angle={-35} textAnchor="end" height={55} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} tickFormatter={fmtAxis} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="empenhado" name="Empenhado" radius={[4,4,0,0]} maxBarSize={28}>
                      {data.porMunic.slice(0,12).map((_, i) => <Cell key={i} fill={CHART_COLORS[(i+3) % CHART_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard title="Fonte de Recursos — Empenhado" icon={<Database className="w-4 h-4" />}
              badge={<span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">{data.porFonte.length}</span>}>
              <HBarChart data={data.porFonte as unknown as Record<string,unknown>[]} xKey="empenhado" labelKey="fonte_recurso" height={256} colorOffset={8} />
            </SectionCard>
          </div>
        )}

        {/* ── Elemento + UO ── */}
        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SectionCard title="Elemento de Despesa — Top 12" icon={<Layers className="w-4 h-4" />}>
              <HBarChart data={data.porElemento as unknown as Record<string,unknown>[]} xKey="empenhado" labelKey="elemento" height={360} colorOffset={2} />
            </SectionCard>
            <SectionCard title="Unidade Orçamentária (UO) — Top 15" icon={<Building2 className="w-4 h-4" />}>
              <div className="h-[360px] overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.porUo.slice(0,15)} layout="vertical" margin={{ left: 0, right: 20, top: 2, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                    <XAxis type="number" tick={{ fontSize: 9, fill: '#94A3B8' }} tickFormatter={fmtAxis} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="uo" width={155} axisLine={false} tickLine={false}
                      tick={{ fontSize: 9, fill: '#475569' }} tickFormatter={v => shortLabel(String(v), 24)} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 10, color: '#64748B' }} />
                    <Bar dataKey="empenhado" name="Empenhado" fill="#6366F1" radius={[0,3,3,0]} maxBarSize={9} />
                    <Bar dataKey="liquidado"  name="Liquidado"  fill="#10B981" radius={[0,3,3,0]} maxBarSize={9} />
                    <Bar dataKey="pago_total" name="Pago Total" fill="#F59E0B" radius={[0,3,3,0]} maxBarSize={9} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          </div>
        )}

        {/* ── DRS Ranking Table ── */}
        {data && data.porDrs.length > 0 && (
          <SectionCard title="Ranking Completo por DRS"
            badge={<span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-semibold">{data.porDrs.length} deptos</span>}
            noPad icon={<BarChart3 className="w-4 h-4" />}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-gray-100">
                    <th className="w-8 px-4 py-3 text-[10px] font-bold text-gray-300 uppercase">#</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-400 uppercase">DRS</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-400 uppercase">Empenhado</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-400 uppercase">Liquidado</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-amber-400 uppercase">Pago Total</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-400 uppercase">% Exec.</th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold text-gray-400 uppercase w-28 hidden md:table-cell">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.porDrs.map((row, i) => {
                    const totalEmp = data.porDrs.reduce((s, r) => s + r.empenhado, 0);
                    const pct   = row.empenhado > 0 ? (row.pago_total / row.empenhado) * 100 : 0;
                    const barW  = totalEmp > 0 ? (row.empenhado / totalEmp) * 100 : 0;
                    const color = CHART_COLORS[i % CHART_COLORS.length];
                    return (
                      <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-2.5 text-xs text-gray-300 font-mono">{i + 1}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                            <span className="font-semibold text-gray-800 text-sm">{row.drs}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-indigo-700 text-sm">{fmt(row.empenhado, 'compact')}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-emerald-600 text-sm">{fmt(row.liquidado, 'compact')}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-amber-600 text-sm">{fmt(row.pago_total, 'compact')}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold',
                            pct >= 80 ? 'bg-emerald-50 text-emerald-700' : pct >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600')}>
                            {pct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: barW + '%', background: color }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {kpis && (
                  <tfoot>
                    <tr className="bg-slate-900 text-white">
                      <td className="px-4 py-3" colSpan={2}><span className="text-xs font-bold text-slate-400">TOTAL GERAL</span></td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-indigo-300">{fmt(kpis.empenhado, 'compact')}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-300">{fmt(kpis.liquidado, 'compact')}</td>
                      <td className="px-4 py-3 text-right font-mono text-amber-300">{fmt(kpis.pago_total, 'compact')}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-white">{kpis.empenhado > 0 ? ((kpis.pago_total / kpis.empenhado) * 100).toFixed(1) : '0.0'}%</span>
                      </td>
                      <td className="hidden md:table-cell" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </SectionCard>
        )}

        {/* ── Detail Table Toggle ── */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={toggleTable}
            className={cn('flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border shadow-sm',
              tableVisible ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-700 border-gray-200 hover:border-indigo-300 hover:text-indigo-600')}>
            <Filter className="w-4 h-4" />
            {tableVisible ? 'Ocultar Tabela' : 'Tabela Detalhada'}
            {detailTotal > 0 && tableVisible && <span className="bg-indigo-100 text-indigo-700 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">{fmt(detailTotal)}</span>}
          </button>
          {tableVisible && (
            <>
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input type="text" value={tableSearch} onChange={e => setTableSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadDetail(0, tableSearch)}
                  placeholder="Cód. UG + Enter..."
                  className="w-full pl-8 pr-4 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white" />
              </div>
              <button onClick={exportCSV} disabled={!detailRows.length}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-40">
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </>
          )}
        </div>

        {/* ── Detail Table ── */}
        {tableVisible && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <p className="font-bold text-gray-800 text-sm">Detalhe LC131 — Enriquecido</p>
              <span className="text-xs text-gray-400">{detailLoading ? <Spinner size={3} /> : <>{fmt(detailTotal)} registros</>}</span>
            </div>
            {detailError ? (
              <div className="p-6 flex items-start gap-3 text-red-400">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-sm">Erro ao carregar detalhes</p>
                  <p className="text-xs mt-1 font-mono opacity-75">{detailError}</p>
                  <p className="text-xs mt-1 text-gray-400">Execute a PARTE 3b do setup SQL no Supabase.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto" style={{ maxHeight: '60vh' }}>
                  <table className="text-xs border-collapse" style={{ minWidth: '3200px' }}>
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-900">
                        {TABLE_COLS.map(col => (
                          <th key={col.key}
                            className={cn('px-3 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap border-r border-white/5', col.numeric && 'text-right')}
                            style={{ minWidth: col.w }}>{col.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {detailLoading && detailRows.length === 0 ? (
                        <tr><td colSpan={TABLE_COLS.length} className="py-16 text-center text-gray-400">
                          <div className="flex flex-col items-center gap-2"><Spinner size={6} /><span>Carregando...</span></div>
                        </td></tr>
                      ) : detailRows.length === 0 ? (
                        <tr><td colSpan={TABLE_COLS.length} className="py-16 text-center text-gray-400">
                          <Database className="w-8 h-8 mx-auto mb-2 opacity-20" />
                          <p className="text-sm">Nenhum registro</p>
                        </td></tr>
                      ) : detailRows.map((row, i) => (
                        <tr key={row.id ?? i} className={cn('transition-colors hover:bg-indigo-50/30', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/20')}>
                          {TABLE_COLS.map(col => {
                            const v = row[col.key];
                            if (col.numeric) {
                              const n = Number(v ?? 0);
                              return <td key={col.key} className="px-3 py-2 text-right font-mono font-semibold text-gray-800 whitespace-nowrap border-r border-gray-100">
                                {n !== 0 ? fmt(n, 'currency') : <span className="text-gray-200">—</span>}
                              </td>;
                            }
                            const s = String(v ?? '');
                            const empty = !s || s === 'null' || s === 'undefined';
                            return <td key={col.key} className="px-3 py-2 border-r border-gray-100"
                              style={{ maxWidth: col.w, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s}>
                              {empty ? <span className="text-gray-200">—</span>
                                : col.key === 'drs' ? <span className="font-semibold text-indigo-700 text-[11px]">{s}</span>
                                : col.key === 'municipio' ? <span className="font-medium text-gray-700">{s}</span>
                                : <span className="text-gray-600">{s}</span>}
                            </td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-gray-100 bg-slate-50/50 flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-gray-500">
                    <strong>{detailPage * DETAIL_PAGE_SIZE + 1}–{Math.min((detailPage + 1) * DETAIL_PAGE_SIZE, detailTotal)}</strong> de <strong>{fmt(detailTotal)}</strong>
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => loadDetail(detailPage - 1, tableSearch)} disabled={detailLoading || detailPage === 0}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">
                      <ChevronLeft className="w-3.5 h-3.5" />Anterior</button>
                    <span className="px-3 py-1.5 text-xs font-bold bg-slate-900 text-white rounded-lg min-w-[36px] text-center">{detailPage + 1}</span>
                    <button onClick={() => loadDetail(detailPage + 1, tableSearch)} disabled={detailLoading || (detailPage + 1) * DETAIL_PAGE_SIZE >= detailTotal}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">
                      Próxima<ChevronRight className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="flex items-center justify-between py-4 border-t border-gray-100 text-xs text-gray-300 flex-wrap gap-2">
          <div className="flex items-center gap-2"><Activity className="w-3.5 h-3.5" /><span className="font-mono">lc131_enriquecida · odnstbeuiojohutoqvvw.supabase.co</span></div>
          <span>LC 131 · Controle Orçamentário SP · {new Date().getFullYear()}</span>
        </div>
      </main>

      {uploadOpen && <UploadPanel onClose={() => setUploadOpen(false)} />}
    </div>
  );
}
`;

writeFileSync(target, content, 'utf8');
console.log('✅ App.tsx v2 written. Lines:', content.split('\n').length);
