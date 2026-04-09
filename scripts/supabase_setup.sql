-- ================================================================
-- SETUP COMPLETO — controleOrcamento
-- Execute no Supabase Dashboard → SQL Editor
-- ================================================================
--
-- NOVA ARQUITETURA (versão 2):
--   • Tabela de referência: "bd_ref"
--     - Chave principal: codigo (= codigo_projeto_atividade da LC131)
--     - Colunas: codigo, unidade, drs, regiao_ad, rras, regiao_sa,
--                cod_ibge, municipio, fonte_recurso, grupo_despesa,
--                tipo_despesa, rotulo
--   • JOIN principal: lc131_despesas.codigo_projeto_atividade → bd_ref.codigo
--   • Fallback 1:     lc131_despesas.codigo_ug → bd_ref.codigo (pelo código UG)
--   • Fallback 2:     pelo codigo_nome_ug (texto)
--   • Script de importação do Excel: scripts/import-bdref.ts
--
-- SEQUÊNCIA DE EXECUÇÃO:
--   1. Execute este script completo no Supabase SQL Editor
--   2. Importe o Excel de referência:
--        npx tsx scripts/import-bdref.ts "caminho/para/DESPESAS.xlsx"
--   3. Recarregue o dashboard — DRS estará preenchido
-- ================================================================


-- ================================================================
-- PARTE 0: TABELA DE REFERÊNCIA bd_ref
-- Substitui a antiga tabela "despesas".
-- Populada pelo script import-bdref.ts a partir do arquivo Excel.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.bd_ref (
  id              BIGSERIAL PRIMARY KEY,
  -- Chave de lookup: código da UG/UO/Projeto Atividade (6 dígitos, ex: 090196)
  codigo          TEXT        NOT NULL,
  unidade         TEXT,       -- nome da unidade/órgão
  -- Campos de enriquecimento geográfico/administrativo
  drs             TEXT,       -- DRS responsável (ex: 'DRS I - Grande São Paulo')
  regiao_ad       TEXT,       -- Região Administrativa (ex: 'Grande São Paulo')
  rras            TEXT,       -- RRAS (ex: 'RRAS 1')
  regiao_sa       TEXT,       -- Região de Saúde (ex: 'Grande São Paulo')
  cod_ibge        TEXT,       -- Código IBGE do município
  municipio       TEXT,       -- Nome do município
  -- Campos financeiros de classificação (opcionais, vindos do Excel)
  fonte_recurso   TEXT,       -- FONTE DE RECURSOS
  grupo_despesa   TEXT,       -- GRUPO DE DESPESA
  tipo_despesa    TEXT,       -- TIPO DE DESPESA
  rotulo          TEXT        -- RÓTULO
);

-- Índice único na chave de lookup (permite upsert eficiente)
CREATE UNIQUE INDEX IF NOT EXISTS idx_bd_ref_codigo
  ON public.bd_ref (codigo);

-- Índice para lookup por nome parcial (para fallback por texto)
CREATE INDEX IF NOT EXISTS idx_bd_ref_unidade
  ON public.bd_ref (unidade);

-- ================================================================
-- PARTE 0b: DADOS SEMENTE — 100 códigos extraídos diretamente do Excel
-- "DESPESAS - 2022 - 2023 - 2024 - 2025   2026 - 31-03-26.xlsx"
-- Gerado automaticamente por scripts/gen-seed.js — NÃO EDITE MANUALMENTE.
-- O script import-bdref.ts faz UPSERT completo ao ser executado.
-- ================================================================

INSERT INTO public.bd_ref
  (codigo, unidade, drs, regiao_ad, rras, regiao_sa, cod_ibge, municipio, fonte_recurso, grupo_despesa, tipo_despesa, rotulo)
VALUES
  ('090033', 'FED-CTO. REABILITACAO DE CASA BRANCA', 'DRS XIV - São João da Boa Vista', 'CAMPINAS', '15', 'Rio Pardo', '351080', 'CASA BRANCA', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090037', 'FED-INSTITUTO ADOLFO LUTZ', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090038', 'FED-INSTITUTO BUTANTAN', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090040', 'FED - INSTITUTO DE SAUDE', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090041', 'FED-INST.DANTE PAZZANESE DE CARDIOLOGIA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090043', 'FED-INST.INFECTOLOGIA EMILIO RIBAS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090101', 'GABINETE DO SECRETARIO E ASSESSORIAS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('090102', 'COORD. GERAL ADMINIST. - CGA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('090105', 'COORD. RECURSOS HUMANOS - CRH', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('090107', 'CTO. VIGILANCIA SANITARIA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090109', 'CENTRO DE REFERENCIA DA SAUDE DA MULHER', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090110', 'CTO. REFERENCIA E TREINAMENTO-DST/AIDS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090111', 'COORD. DE PLANEJAMENTO DE SAUDE', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('090112', 'GABINETE DO COORDENADOR', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090113', 'DEPTO.REG.SAUDE - DRS-II ARACATUBA', 'DRS II - Araçatuba', 'ARAÇATUBA', '12', 'Central do DRS II', '350280', 'ARACATUBA', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090115', 'DEPTO.REG.SAUDE - DRS-VI BAURU', 'DRS VI - Bauru', 'BAURU', '9', 'Bauru', '350600', 'BAURU', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090116', 'DEPTO.REG.SAUDE - DRS-IX MARILIA', 'DRS IX - Marília', 'MARILIA', '10', 'Marilia', '352900', 'MARILIA', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090117', 'DEPTO.REG.SAUDE - DRS XI PRES.PRUDENTE', 'DRS XI - Presidente Prudente', 'PRESIDENTE PRUDENTE', '11', 'Alta Sorocabana', '354140', 'PRESIDENTE PRUDENTE', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090118', 'HOSP.GERAL PREF. MIGUEL GUALDA DE PROMISSAO', 'DRS VI - Bauru', 'BAURU', '9', 'Lins', '354160', 'PROMISSAO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090120', 'HOSP.EST. DR.OSWALDO B. FARIA -MIRANDOPOLIS', 'DRS II - Araçatuba', 'ARAÇATUBA', '12', 'Lagos do DRS II', '353010', 'MIRANDOPOLIS', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090121', 'HOSP. REGIONAL DE ASSIS', 'DRS IX - Marília', 'MARILIA', '10', 'Assis', '350400', 'ASSIS', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090122', 'HOSP. DR.ODILO A.SIQUEIRA, P.PRUDENTE', 'DRS XI - Presidente Prudente', 'PRESIDENTE PRUDENTE', '11', 'Alta Sorocabana', '354140', 'PRESIDENTE PRUDENTE', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090123', 'DEPTO.REG.SAUDE DRS-III ARARAQUARA', 'DRS III - Araraquara', 'CENTRAL', '18', 'Central do DRS III', '350320', 'ARARAQUARA', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090124', 'DEPTO.REG.SAUDE - DRS-V BARRETOS', 'DRS V - Barretos', 'BARRETOS', '13', 'Norte - Barretos', '350550', 'BARRETOS', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090125', 'DEPTO.REG.SAUDE - DRS-VIII FRANCA', 'DRS VIII - Franca', 'FRANCA', '13', 'Tres Colinas', '351620', 'FRANCA', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090126', 'DEPTO.REG.SAUDE DRS-XIII RIB.PRETO', 'DRS XIII - Ribeirão Preto', 'RIBEIRÃO PRETO', '13', 'Aquifero Guarani', '354340', 'RIBEIRAO PRETO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090127', 'DEPTO.REG.SAUDE - DRS-XV SJRPRETO', 'DRS XV - São José do Rio Preto', 'SÃO JOSÉ DO RIO PRETO', '12', 'Sao Jose do Rio Preto', '354980', 'SAO JOSE DO RIO PRETO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090128', 'HOSP. NESTOR GOULART REIS', 'DRS III - Araraquara', 'CENTRAL', '18', 'Central do DRS III', '350170', 'AMERICO BRASILIENSE', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090129', 'HOSP. STA.TEREZA, RIB.PRETO', 'DRS XIII - Ribeirão Preto', 'RIBEIRÃO PRETO', '13', 'Aquifero Guarani', '354340', 'RIBEIRAO PRETO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090130', 'CTO.ATENCAO INTEGRAL A SAUDE S.RITA', 'DRS XIII - Ribeirão Preto', 'CENTRAL', '13', 'Aquifero Guarani', '354750', 'SANTA RITA DO PASSA QUATRO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090131', 'DEPTO.REG.SAUDE - DRS-VII CAMPINAS', 'DRS VII - Campinas', 'CAMPINAS', '15', 'Reg Metro Campinas', '350950', 'CAMPINAS', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090132', 'DEPTO.REG.SAUDE - DRS-X PIRACICABA', 'DRS X - Piracicaba', 'CAMPINAS', '14', 'Piracicaba', '353870', 'PIRACICABA', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090133', 'DEPTO.REG.SAUDE - DRS-XIV SJBOA VISTA', 'DRS XIV - São João da Boa Vista', 'CAMPINAS', '15', 'Mantiqueira', '354910', 'SAO JOAO DA BOA VISTA', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090135', 'DEPTO.REG.SAUDE DE TAUBATE - DRS-XVII', 'DRS XVII - Taubaté', 'SÃO JOSÉ DOS CAMPOS', '17', 'V. Paraiba-Reg. Serrana', '355410', 'TAUBATE', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090137', 'DEPTO.REG.SAUDE - DRS-XII REGISTRO', 'DRS XII - Registro', 'REGISTRO', '7', 'Vale do Ribeira', '354260', 'REGISTRO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090138', 'DEPTO.REG.SAUDE - DRS-IV BAIXADA SANTISTA', 'DRS IV - Baixada Santista', 'LITORAL NORTE', '7', 'Baixada Santista', '354850', 'SANTOS', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090139', 'DEPTO.REG.SAUDE - DRS-XVI SOROCABA', 'DRS XVI - Sorocaba', 'SOROCABA', '8', 'Sorocaba', '355220', 'SOROCABA', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090140', 'HOSP.DR.LEONARDO BEVILACQUA-PARIQUERA-ACU', 'DRS XII - Registro', 'REGISTRO', '7', 'Vale do Ribeira', '353620', 'PARIQUERA-ACU', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090141', 'HOSP. GUILHERME ALVARO, SANTOS', 'DRS IV - Baixada Santista', 'LITORAL NORTE', '7', 'Baixada Santista', '354850', 'SANTOS', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090143', 'CONJ. HOSPITALAR DE SOROCABA', 'DRS XVI - Sorocaba', 'SOROCABA', '8', 'Sorocaba', '355220', 'SOROCABA', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090145', 'CAIS - PROF. CANTIDIO DE MOURA CAMPOS', 'DRS VI - Bauru', 'SOROCABA', '9', 'Polo Cuesta', '350750', 'BOTUCATU', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090146', 'CTO. REABILITACAO DE CASA BRANCA', 'DRS XIV - São João da Boa Vista', 'CAMPINAS', '15', 'Rio Pardo', '351080', 'CASA BRANCA', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090147', 'CAIS - CLEMENTE FERREIRA, LINS', 'DRS VI - Bauru', 'BAURU', '9', 'Lins', '352710', 'LINS', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090148', 'GABINETE DO COORDENADOR', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090149', 'DEPTO. GERENC. AMBULATORIAL DA CAPITAL-DGAC', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090154', 'HOSP. GERAL DE VILA NOVA CACHOEIRINHA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090155', 'HOSPITAL GERAL DE TAIPAS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090156', 'HOSP. GERAL DR.JOSE PANGELLA DE VILA PENTEAD', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090157', 'HOSP. REGIONAL SUL', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090158', 'HOSP.GERAL J.TEIXEIRA DA COSTA,EM GUAIANASES', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090159', 'HOSP. GERAL S.MATEUS, DR.MANOEL BIFULCO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090160', 'UN. GESTAO ASSISTENCIAL I-HOSP. HELIOPOLIS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090161', 'UN. GESTAO ASSISTENCIAL II-HOSP. IPIRANGA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090162', 'UN. GESTAO ASSIST.III - HOSP.INF.DARCY VARGA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090163', 'UN. GESTAO ASSIST. IV-HOSP.MAT.L.M.BARROS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090164', 'UN. GESTAO ASSISTENCIAL V-HOSP. BRIGADEIRO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090165', 'COMPLEXO HOSP.DO JUQUERY, EM FRANCO DA ROCHA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '3', 'Franco da Rocha', '351640', 'FRANCO DA ROCHA', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090166', 'HOSP.REG.DR.O.F.COELHO,EM F.DE VASCONCELOS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '2', 'Alto do Tiete', '351570', 'FERRAZ DE VASCONCELOS', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090167', 'HOSP. REG. DR.VIVALDO M.SIMOES, OSASCO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '5', 'Rota dos Bandeirantes', '353440', 'OSASCO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090168', 'HOSP.MAT.INTERLAGOS-WALDEMAR SEYSSEL-ARRELIA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090169', 'HOSP. INFANTIL CANDIDO FONTOURA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090170', 'CTO.AT.INTEG.SAUDE MENTAL-DR.DAVID C.C.FILHO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090171', 'COMPLEXO HOSP. PE.BENTO, DE GUARULHOS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '2', 'Alto do Tiete', '351880', 'GUARULHOS', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090172', 'CONJUNTO HOSPITALAR DO MANDAQUI-CHM', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090173', 'CTO.ATENCAO INTEGRADA EM SAUDE MENTAL-P.PINE', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090175', 'CTO.ESPECIALIZ. REABILITACAO DR. APC-M.CRUZE', 'DRS I - Grande São Paulo', 'SÃO PAULO', '2', 'Alto do Tiete', '353060', 'MOGI DAS CRUZES', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090176', 'GABINETE DO COORDENADOR', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090177', 'INSTITUTO ADOLFO LUTZ', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090178', 'INSTITUTO BUTANTAN', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090179', 'INSTITUTO PASTEUR', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090180', 'INSTITUTO DE SAUDE', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090181', 'INSTITUTO DANTE PAZZANESE DE CARDIOLOGIA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090182', 'INST. LAURO DE SOUZA LIMA, EM BAURU', 'DRS VI - Bauru', 'BAURU', '9', 'Bauru', '350600', 'BAURU', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090183', 'INST. INFECTOLOGIA EMILIO RIBAS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090184', 'HOSP. DAS CLINICAS LUZIA DE PINHO MELO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '2', 'Alto do Tiete', '353060', 'MOGI DAS CRUZES', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090186', 'CENTRO PIONEIRO EM ATENCAO PSICOSSOCIAL-AJJE', 'DRS I - Grande São Paulo', 'SÃO PAULO', '3', 'Franco da Rocha', '351640', 'FRANCO DA ROCHA', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090187', 'INST.PAULISTA DE GERIATRIA E GERONTOLOG.-IPG', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090188', 'CTO REF. ALCOOL, TABACO E OUTRAS DROGAS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090189', 'GABINETE DO COORDENADOR', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090190', 'INSTITUTO CLEMENTE FERREIRA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090191', 'DEPTO.REG.GRANDE SAO PAULO - DRS-I G.S.PAULO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090192', 'GABINETE DO COORDENADOR', 'DRS XV - São José do Rio Preto', 'SÃO JOSÉ DO RIO PRETO', '12', 'Fernandopolis', '351550', 'FERNANDOPOLIS', NULL, NULL, 'ORGANIZAÇÃO SOCIAL', NULL),
  ('090193', 'GRUPO DE GERENCIAMENTO ADMINISTRATIVO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090194', 'CTO.VIGIL. EPIDEMIOLOGICA PROF.A.VRANJAC-CVE', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090195', 'SECR.EXECUTIVA CONSELHO ADMINISTRATIVO-FESIM', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090196', 'COORD. DE GESTAO ORCAMENTARIA E FINANCEIRA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'CONVÊNIO', NULL),
  ('090200', 'GRUPO DE RESGATE - GRAU', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090201', 'GABINETE DO COORDENADOR', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090202', 'GRUPO DE GERENCI.DEMANDAS POR MEDICAMENTOS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090203', 'HOSP.EST.ESPEC.REAB.DR.FRANCISCO R.ARANTES', 'DRS XVI - Sorocaba', 'SOROCABA', '8', 'Sorocaba', '352390', 'ITU', NULL, NULL, 'UNIDADE PRÓPRIA', NULL),
  ('090205', 'GABINETE DO COORDENADOR', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('091101', 'FUND.P/REMEDIO POPULAR-CHOPIN TAVARES DE LIM', 'DRS I - Grande São Paulo', 'SÃO PAULO', '2', 'Alto do Tiete', '351880', 'GUARULHOS', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('091102', 'FUND.P/REM.POPULAR-CHOPIN T. DE LIMA-FURP-AB', 'DRS I - Grande São Paulo', 'SÃO PAULO', '2', 'Alto do Tiete', '351880', 'GUARULHOS', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('091201', 'FUNDACAO ONCOCENTRO DE SAO PAULO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('091301', 'FUND. PRO-SANGUE HEMOCENTRO SP.', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('092101', 'SUPERIN. DE CONTROLE DE ENDEMIAS-SUCEN', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('092201', 'HOSP. DAS CLINICAS, RIB.PRETO', 'DRS XIII - Ribeirão Preto', 'RIBEIRÃO PRETO', '13', 'Aquifero Guarani', '354340', 'RIBEIRAO PRETO', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('092301', 'HOSP. DAS CLINICAS, SAO PAULO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('092501', 'HOSP. DAS CLINICAS, BOTUCATU', 'DRS VI - Bauru', 'SOROCABA', '9', 'Polo Cuesta', '350750', 'BOTUCATU', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('092601', 'HOSP. CLINICAS FAC.MED.MARILIA - HCFAMEMA', 'DRS IX - Marília', 'MARILIA', '10', 'Marilia', '352900', 'MARILIA', NULL, NULL, 'TRANFERÊNCIA VOLUNTÁRIA', NULL)
ON CONFLICT (codigo) DO UPDATE SET
  unidade       = EXCLUDED.unidade,
  drs           = EXCLUDED.drs,
  regiao_ad     = EXCLUDED.regiao_ad,
  rras          = EXCLUDED.rras,
  regiao_sa     = EXCLUDED.regiao_sa,
  cod_ibge      = EXCLUDED.cod_ibge,
  municipio     = EXCLUDED.municipio,
  tipo_despesa  = EXCLUDED.tipo_despesa;
-- Nota: fonte_recurso e grupo_despesa são omitidos do seed pois variam por
-- transação e são preenchidos pelo import-bdref.ts a partir do Excel completo.

-- Permissões
GRANT SELECT ON public.bd_ref TO anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bd_ref' AND policyname = 'anon_read_bd_ref'
  ) THEN
    ALTER TABLE public.bd_ref ENABLE ROW LEVEL SECURITY;
    CREATE POLICY anon_read_bd_ref ON public.bd_ref FOR SELECT TO anon USING (true);
  END IF;
END $$;


-- ================================================================
-- PARTE 0c: TABELA DE REFERÊNCIA tab_drs
-- Mapeamento municipio → DRS (Departamento Regional de Saúde)
-- Populada pelo script: npx tsx scripts/import-drs-rras.ts <DRS.xlsx>
-- Chave: nome do município em MAIÚSCULAS sem acentos (igual ao campo
--        nome_municipio da tabela lc131_despesas).
-- ================================================================

CREATE TABLE IF NOT EXISTS public.tab_drs (
  municipio  TEXT PRIMARY KEY,  -- ex: 'SAO PAULO', 'CAMPINAS'
  drs        TEXT NOT NULL       -- ex: '01 Grande São Paulo'
);

GRANT SELECT ON public.tab_drs TO anon, authenticated;


-- ================================================================
-- PARTE 0d: TABELA DE REFERÊNCIA tab_rras
-- Mapeamento municipio → RRAS (Rede Regional de Atenção à Saúde)
-- Populada pelo script: npx tsx scripts/import-drs-rras.ts <RRAS.xlsx>
-- ================================================================

CREATE TABLE IF NOT EXISTS public.tab_rras (
  municipio  TEXT PRIMARY KEY,  -- ex: 'SAO PAULO', 'CAMPINAS'
  rras       TEXT NOT NULL       -- ex: 'RRAS 06'
);

GRANT SELECT ON public.tab_rras TO anon, authenticated;


-- ================================================================
-- PARTE 0e: ADICIONAR COLUNA nome_municipio À TABELA lc131_despesas
-- Presente nos novos arquivos LC 131 a partir de 2022 (coluna "Nome Município").
-- Permite JOIN direto com tab_drs e tab_rras sem depender do bd_ref.
-- O script import-lc131.ts já mapeia automaticamente esta coluna.
-- ================================================================

ALTER TABLE public.lc131_despesas
  ADD COLUMN IF NOT EXISTS nome_municipio TEXT;

CREATE INDEX IF NOT EXISTS idx_lc131_nome_municipio
  ON public.lc131_despesas (nome_municipio);


-- ================================================================
-- PARTE 1: VIEW lc131_enriquecida
-- Prioridade de enriquecimento:
--   1º: nome_municipio → tab_drs  (DRS direto, novo)
--   1º: nome_municipio → tab_rras (RRAS direto, novo)
--   2º: codigo_projeto_atividade → bd_ref (fallback código)
--   3º: codigo_ug → bd_ref
--   4º: prefixo numérico do codigo_nome_ug → bd_ref
-- ================================================================

-- DROP necessário pois CREATE OR REPLACE não pode renomear/reordenar colunas
DROP VIEW IF EXISTS public.lc131_enriquecida CASCADE;

CREATE VIEW public.lc131_enriquecida AS
SELECT
  lc.id,
  lc.ano_referencia,

  -- ── DRS ────────────────────────────────────────────────────────
  -- 1º: nome_municipio → tab_drs (direto, mais confiável)
  -- 2º: codigo_projeto_atividade → bd_ref (fallback)
  -- 3º: codigo_ug → bd_ref
  -- 4º: prefixo numérico do codigo_nome_ug → bd_ref
  -- TRIM aplicado para remover espaços ou artefatos de encoding
  NULLIF(TRIM(COALESCE(
    td.drs,
    rb1.drs,
    rb2.drs,
    rb3.drs
  )), '') AS drs,

  -- ── RRAS ───────────────────────────────────────────────────────
  -- 1º: nome_municipio → tab_rras (direto)
  -- 2º–4º: bd_ref fallback
  NULLIF(TRIM(COALESCE(tr.rras, rb1.rras, rb2.rras, rb3.rras)), '') AS rras,

  -- Região administrativa e de saúde ainda vêm do bd_ref
  COALESCE(rb1.regiao_ad, rb2.regiao_ad, rb3.regiao_ad) AS regiao_ad,
  COALESCE(rb1.regiao_sa, rb2.regiao_sa, rb3.regiao_sa) AS regiao_sa,
  COALESCE(rb1.cod_ibge,  rb2.cod_ibge,  rb3.cod_ibge)  AS cod_ibge,

  -- ── Município ──────────────────────────────────────────────────
  -- Prefere o nome direto do LC131, fallback via bd_ref
  COALESCE(lc.nome_municipio, rb1.municipio, rb2.municipio, rb3.municipio) AS municipio,

  -- ── Classificação financeira ─────────────────────────────────
  COALESCE(rb1.fonte_recurso, rb2.fonte_recurso, rb3.fonte_recurso)   AS fonte_recurso,
  COALESCE(rb1.grupo_despesa, rb2.grupo_despesa, rb3.grupo_despesa)   AS grupo_despesa,
  COALESCE(rb1.tipo_despesa,  rb2.tipo_despesa,  rb3.tipo_despesa)    AS tipo_despesa,
  COALESCE(rb1.rotulo,        rb2.rotulo,        rb3.rotulo)          AS rotulo,

  -- ── Colunas originais da LC131 ───────────────────────────────
  lc.codigo_nome_uo,
  lc.codigo_nome_ug,
  lc.codigo_ug,
  lc.codigo_nome_projeto_atividade,
  lc.codigo_projeto_atividade,
  lc.codigo_nome_fonte_recurso,
  lc.codigo_fonte_recursos,
  lc.codigo_nome_grupo,
  lc.codigo_nome_elemento,
  lc.codigo_elemento,
  lc.codigo_nome_favorecido,
  lc.codigo_favorecido,
  lc.descricao_processo,
  lc.numero_processo,
  lc.nome_municipio,

  -- ── Valores financeiros ──────────────────────────────────────
  lc.empenhado,
  lc.liquidado,
  lc.pago,
  lc.pago_anos_anteriores,
  COALESCE(lc.pago, 0) + COALESCE(lc.pago_anos_anteriores, 0) AS pago_total

FROM public.lc131_despesas lc

-- JOIN 0: nome_municipio → tab_drs (novo: direto pelo nome do município)
LEFT JOIN public.tab_drs td
  ON td.municipio = lc.nome_municipio

-- JOIN 0b: nome_municipio → tab_rras (novo: direto pelo nome do município)
LEFT JOIN public.tab_rras tr
  ON tr.municipio = lc.nome_municipio

-- JOIN 1: codigo_projeto_atividade → bd_ref.codigo (match exato)
LEFT JOIN public.bd_ref rb1
  ON rb1.codigo = lc.codigo_projeto_atividade::text

-- JOIN 2: codigo_ug → bd_ref.codigo (UG como fallback)
LEFT JOIN public.bd_ref rb2
  ON rb2.codigo = lc.codigo_ug::text

-- JOIN 3: extrai os 6 primeiros dígitos do codigo_nome_ug
--   ex: "090131 DEPTO.REG.SAUDE..." → "090131"
LEFT JOIN public.bd_ref rb3
  ON rb3.codigo = NULLIF(regexp_replace(
      split_part(lc.codigo_nome_ug::text, ' ', 1),
      '[^0-9]', '', 'g'
    ), '');

-- Permissões
GRANT SELECT ON public.lc131_enriquecida TO anon, authenticated;
GRANT SELECT ON public.lc131_despesas    TO anon, authenticated;
GRANT SELECT ON public.bd_ref            TO anon, authenticated;

-- RLS para lc131_despesas
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lc131_despesas' AND policyname = 'anon_read_lc131'
  ) THEN
    CREATE POLICY anon_read_lc131 ON public.lc131_despesas FOR SELECT TO anon USING (true);
  END IF;
END $$;


-- ================================================================
-- PARTE 2: ÍNDICES para otimizar JOINs
-- ================================================================

-- Índice principal para JOIN 1 (col. codigo_projeto_atividade)
CREATE INDEX IF NOT EXISTS idx_lc131_cod_projeto
  ON public.lc131_despesas (codigo_projeto_atividade);

-- Índice para JOIN 2 (codigo_ug)
CREATE INDEX IF NOT EXISTS idx_lc131_cod_ug
  ON public.lc131_despesas (codigo_ug);

-- Índice para extrair prefixo do codigo_nome_ug (JOIN 3)
CREATE INDEX IF NOT EXISTS idx_lc131_cod_nome_ug_prefix
  ON public.lc131_despesas (
    NULLIF(regexp_replace(split_part(codigo_nome_ug::text, ' ', 1), '[^0-9]', '', 'g'), '')
  );

-- Índice para financeiro (ORDER BY nas RPCs)
CREATE INDEX IF NOT EXISTS idx_lc131_empenhado
  ON public.lc131_despesas (empenhado DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_lc131_ano
  ON public.lc131_despesas (ano_referencia);


-- ================================================================
-- PARTE 3: FUNÇÃO RPC — dashboard completo
-- CORREÇÃO: usa colunas originais da lc131_despesas (codigo_nome_grupo,
--           codigo_nome_fonte_recurso, codigo_nome_elemento) em vez de
--           bd_ref.grupo_despesa que pode ser NULL.
-- ================================================================
-- Drops both old signatures (1-param and 14-param after previous run)
DROP FUNCTION IF EXISTS public.lc131_dashboard(integer);
DROP FUNCTION IF EXISTS public.lc131_dashboard(integer,text,text,text,text,text,text,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.lc131_dashboard(
  p_ano           integer DEFAULT NULL,
  p_drs           text    DEFAULT NULL,
  p_regiao_ad     text    DEFAULT NULL,
  p_rras          text    DEFAULT NULL,
  p_regiao_sa     text    DEFAULT NULL,
  p_municipio     text    DEFAULT NULL,
  p_grupo_despesa text    DEFAULT NULL,
  p_tipo_despesa  text    DEFAULT NULL,
  p_rotulo        text    DEFAULT NULL,
  p_fonte_recurso text    DEFAULT NULL,
  p_codigo_ug     text    DEFAULT NULL,
  p_uo            text    DEFAULT NULL,
  p_elemento      text    DEFAULT NULL,
  p_favorecido    text    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
DECLARE result json;
BEGIN
  -- CTE única filtrada: base para TODOS os gráficos (comportamento Power BI)
  WITH base AS (
    SELECT v.*
    FROM public.lc131_enriquecida v
    WHERE
      (p_ano           IS NULL OR v.ano_referencia::text = p_ano::text)
      AND (p_drs           IS NULL OR EXISTS (SELECT 1 FROM regexp_split_to_table(p_drs,           E'\\|') t(val) WHERE v.drs                     ILIKE '%' || trim(t.val) || '%'))
      AND (p_regiao_ad     IS NULL OR EXISTS (SELECT 1 FROM regexp_split_to_table(p_regiao_ad,     E'\\|') t(val) WHERE v.regiao_ad                ILIKE '%' || trim(t.val) || '%'))
      AND (p_rras          IS NULL OR EXISTS (SELECT 1 FROM regexp_split_to_table(p_rras,          E'\\|') t(val) WHERE v.rras                     ILIKE '%' || trim(t.val) || '%'))
      AND (p_regiao_sa     IS NULL OR EXISTS (SELECT 1 FROM regexp_split_to_table(p_regiao_sa,     E'\\|') t(val) WHERE v.regiao_sa                ILIKE '%' || trim(t.val) || '%'))
      AND (p_municipio     IS NULL OR EXISTS (SELECT 1 FROM regexp_split_to_table(p_municipio,     E'\\|') t(val) WHERE v.municipio                ILIKE '%' || trim(t.val) || '%'))
      AND (p_grupo_despesa IS NULL OR EXISTS (SELECT 1 FROM regexp_split_to_table(p_grupo_despesa, E'\\|') t(val) WHERE v.codigo_nome_grupo         ILIKE '%' || trim(t.val) || '%'))
      AND (p_tipo_despesa  IS NULL OR EXISTS (SELECT 1 FROM regexp_split_to_table(p_tipo_despesa,  E'\\|') t(val) WHERE v.tipo_despesa              ILIKE '%' || trim(t.val) || '%'))
      AND (p_rotulo        IS NULL OR EXISTS (SELECT 1 FROM regexp_split_to_table(p_rotulo,        E'\\|') t(val) WHERE v.rotulo                    ILIKE '%' || trim(t.val) || '%'))
      AND (p_fonte_recurso IS NULL OR EXISTS (SELECT 1 FROM regexp_split_to_table(p_fonte_recurso, E'\\|') t(val) WHERE v.codigo_nome_fonte_recurso ILIKE '%' || trim(t.val) || '%'))
      AND (p_codigo_ug     IS NULL OR v.codigo_ug::text = p_codigo_ug)
      AND (p_uo            IS NULL OR EXISTS (SELECT 1 FROM regexp_split_to_table(p_uo,            E'\\|') t(val) WHERE v.codigo_nome_uo            ILIKE '%' || trim(t.val) || '%'))
      AND (p_elemento      IS NULL OR EXISTS (SELECT 1 FROM regexp_split_to_table(p_elemento,      E'\\|') t(val) WHERE v.codigo_nome_elemento      ILIKE '%' || trim(t.val) || '%'))
      AND (p_favorecido    IS NULL OR EXISTS (SELECT 1 FROM regexp_split_to_table(p_favorecido,    E'\\|') t(val) WHERE v.codigo_nome_favorecido    ILIKE '%' || trim(t.val) || '%'))
  )
  SELECT json_build_object(

    -- ── KPIs globais ────────────────────────────────────────────────
    'kpis', (
      SELECT json_build_object(
        'empenhado',  SUM(COALESCE(empenhado, 0)),
        'liquidado',  SUM(COALESCE(liquidado, 0)),
        'pago',       SUM(COALESCE(pago, 0)),
        'pago_total', SUM(pago_total),
        'total',      COUNT(*),
        'municipios', COUNT(DISTINCT COALESCE(municipio, codigo_ug::text))
      )
      FROM base
    ),

    -- ── Evolução anual ────────────────────────────────────────────────
    'por_ano', (
      SELECT json_agg(r ORDER BY r.ano) FROM (
        SELECT ano_referencia::int AS ano,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(COALESCE(liquidado, 0)) AS liquidado,
          SUM(COALESCE(pago, 0))      AS pago,
          SUM(pago_total)             AS pago_total,
          COUNT(*)                    AS registros
        FROM base WHERE ano_referencia IS NOT NULL
        GROUP BY ano_referencia
      ) r
    ),

    -- ── Por grupo de despesa ──────────────────────────────────────────
    'por_grupo', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_grupo AS grupo_despesa,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(COALESCE(liquidado, 0)) AS liquidado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE codigo_nome_grupo IS NOT NULL AND codigo_nome_grupo <> ''
        GROUP BY codigo_nome_grupo ORDER BY 2 DESC LIMIT 12
      ) r
    ),

    -- ── Por DRS ───────────────────────────────────────────────────────
    'por_drs', (
      SELECT json_agg(r) FROM (
        SELECT drs,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(COALESCE(liquidado, 0)) AS liquidado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE drs IS NOT NULL AND drs <> ''
        GROUP BY drs ORDER BY 2 DESC LIMIT 20
      ) r
    ),

    -- ── Por município ─────────────────────────────────────────────────
    'por_municipio', (
      SELECT json_agg(r) FROM (
        SELECT municipio,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE municipio IS NOT NULL AND municipio <> ''
        GROUP BY municipio ORDER BY 2 DESC LIMIT 15
      ) r
    ),

    -- ── Por fonte de recurso ──────────────────────────────────────────
    'por_fonte', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_fonte_recurso AS fonte_recurso,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE codigo_nome_fonte_recurso IS NOT NULL AND codigo_nome_fonte_recurso <> ''
        GROUP BY codigo_nome_fonte_recurso ORDER BY 2 DESC LIMIT 12
      ) r
    ),

    -- ── Por elemento de despesa ───────────────────────────────────────
    'por_elemento', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_elemento AS elemento,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE codigo_nome_elemento IS NOT NULL AND codigo_nome_elemento <> ''
        GROUP BY codigo_nome_elemento ORDER BY 2 DESC LIMIT 12
      ) r
    ),

    -- ── Por região administrativa ─────────────────────────────────────
    'por_regiao_ad', (
      SELECT json_agg(r) FROM (
        SELECT regiao_ad,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE regiao_ad IS NOT NULL AND regiao_ad <> ''
        GROUP BY regiao_ad ORDER BY 2 DESC LIMIT 20
      ) r
    ),

    -- ── Por UO (unidade orçamentária) ─────────────────────────────────
    'por_uo', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_uo AS uo,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(COALESCE(liquidado, 0)) AS liquidado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE codigo_nome_uo IS NOT NULL AND codigo_nome_uo <> ''
        GROUP BY codigo_nome_uo ORDER BY 2 DESC LIMIT 15
      ) r
    ),

    -- ── Por RRAS ──────────────────────────────────────────────────────
    'por_rras', (
      SELECT json_agg(r) FROM (
        SELECT rras,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(COALESCE(liquidado, 0)) AS liquidado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE rras IS NOT NULL AND rras <> ''
        GROUP BY rras ORDER BY 2 DESC LIMIT 20
      ) r
    ),

    -- ── Por tipo de despesa ───────────────────────────────────────────
    'por_tipo_despesa', (
      SELECT json_agg(r) FROM (
        SELECT tipo_despesa,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(COALESCE(liquidado, 0)) AS liquidado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE tipo_despesa IS NOT NULL AND tipo_despesa <> ''
        GROUP BY tipo_despesa ORDER BY 2 DESC LIMIT 12
      ) r
    ),

    -- ── Por rótulo ────────────────────────────────────────────────────
    'por_rotulo', (
      SELECT json_agg(r) FROM (
        SELECT rotulo,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE rotulo IS NOT NULL AND rotulo <> ''
        GROUP BY rotulo ORDER BY 2 DESC LIMIT 12
      ) r
    ),

    -- ── Top favorecidos (maiores beneficiários) ───────────────────────
    'por_favorecido', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_favorecido AS favorecido,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total,
          COUNT(*)                    AS contratos
        FROM base WHERE codigo_nome_favorecido IS NOT NULL AND codigo_nome_favorecido <> ''
        GROUP BY codigo_nome_favorecido ORDER BY 2 DESC LIMIT 20
      ) r
    ),

    -- ── Top projetos/atividades ───────────────────────────────────────
    'por_projeto', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_projeto_atividade AS projeto,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total,
          COUNT(*)                    AS registros
        FROM base WHERE codigo_nome_projeto_atividade IS NOT NULL AND codigo_nome_projeto_atividade <> ''
        GROUP BY codigo_nome_projeto_atividade ORDER BY 2 DESC LIMIT 20
      ) r
    ),

    -- ── Top UGs (unidades gestoras) ───────────────────────────────────
    'por_ug', (
      SELECT json_agg(r) FROM (
        SELECT codigo_nome_ug AS ug,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE codigo_nome_ug IS NOT NULL AND codigo_nome_ug <> ''
        GROUP BY codigo_nome_ug ORDER BY 2 DESC LIMIT 15
      ) r
    ),

    -- ── Por região de saúde ───────────────────────────────────────────
    'por_regiao_sa', (
      SELECT json_agg(r) FROM (
        SELECT regiao_sa,
          SUM(COALESCE(empenhado, 0)) AS empenhado,
          SUM(pago_total)             AS pago_total
        FROM base WHERE regiao_sa IS NOT NULL AND regiao_sa <> ''
        GROUP BY regiao_sa ORDER BY 2 DESC LIMIT 20
      ) r
    )

  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_dashboard(integer,text,text,text,text,text,text,text,text,text,text,text,text,text) TO anon, authenticated;


-- ================================================================
-- PARTE 3b: lc131_detail — definição movida para PARTE 8
--           (versão atualizada com p_uo / p_elemento / p_favorecido)
-- ================================================================
-- Limpa versões antigas caso existam
DROP FUNCTION IF EXISTS public.lc131_detail(integer,text,text,text,text,text,text,text,text,text,text,integer,integer);
DROP FUNCTION IF EXISTS public.lc131_detail(integer,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,integer);


-- ================================================================
-- PARTE 4: VALIDAÇÃO
-- ================================================================
-- Após executar este script + importar os dados, valide com:
--
-- SELECT COUNT(*) AS total_tab_drs   FROM public.tab_drs;
-- SELECT COUNT(*) AS total_tab_rras  FROM public.tab_rras;
-- SELECT COUNT(*) AS total_bd_ref    FROM public.bd_ref;
--
-- Cobertura de DRS (deve ser ~98% nos dados com nome_municipio):
-- SELECT
--   COUNT(*)                                                   AS total,
--   COUNT(drs)                                                 AS com_drs,
--   ROUND(COUNT(drs)::numeric / COUNT(*) * 100, 1)             AS pct_drs,
--   COUNT(municipio)                                           AS com_municipio
-- FROM public.lc131_enriquecida
-- WHERE ano_referencia = 2025;
--
-- Municípios sem match em tab_drs (para complementar manualmente):
-- SELECT DISTINCT nome_municipio
-- FROM public.lc131_despesas
-- WHERE nome_municipio IS NOT NULL
--   AND nome_municipio NOT IN (SELECT municipio FROM public.tab_drs)
-- ORDER BY 1;
--
-- Municípios sem match em tab_rras:
-- SELECT DISTINCT nome_municipio
-- FROM public.lc131_despesas
-- WHERE nome_municipio IS NOT NULL
--   AND nome_municipio NOT IN (SELECT municipio FROM public.tab_rras)
-- ORDER BY 1;


-- ================================================================
-- PARTE 5: OTIMIZAÇÃO DE ESPAÇO
-- ================================================================
-- VACUUM FULL ANALYZE public.lc131_despesas;
-- VACUUM FULL ANALYZE public.bd_ref;
-- VACUUM FULL ANALYZE public.tab_drs;
-- VACUUM FULL ANALYZE public.tab_rras;


-- ================================================================
-- PARTE 6: ÍNDICES EXTRAS PARA PERFORMANCE
-- Reduz tempo de filtro na tabela de detalhe de ~8s para <1s.
-- ================================================================

-- nome_municipio: principal JOIN com tab_drs/tab_rras
-- (já existe idx_lc131_nome_municipio, criado na PARTE 0e)

-- Índices para os filtros mais usados no lc131_detail
CREATE INDEX IF NOT EXISTS idx_lc131_codigo_nome_grupo
  ON public.lc131_despesas (codigo_nome_grupo);

CREATE INDEX IF NOT EXISTS idx_lc131_codigo_nome_fonte
  ON public.lc131_despesas (codigo_nome_fonte_recurso);

CREATE INDEX IF NOT EXISTS idx_lc131_codigo_nome_elemento
  ON public.lc131_despesas (codigo_nome_elemento);

CREATE INDEX IF NOT EXISTS idx_lc131_codigo_nome_favorecido
  ON public.lc131_despesas (codigo_nome_favorecido);

-- Índice composto (ano + municipio) — usado em KPIs filtrados por ano
CREATE INDEX IF NOT EXISTS idx_lc131_ano_municipio
  ON public.lc131_despesas (ano_referencia, nome_municipio);

-- Índice composto (ano + codigo_projeto_atividade) — JOIN 1 filtrado por ano
CREATE INDEX IF NOT EXISTS idx_lc131_ano_cod_projeto
  ON public.lc131_despesas (ano_referencia, codigo_projeto_atividade);

-- Índice em tab_drs e tab_rras (já são TEXT PRIMARY KEY, mas força index usage)
CREATE INDEX IF NOT EXISTS idx_tab_drs_municipio  ON public.tab_drs  (municipio);
CREATE INDEX IF NOT EXISTS idx_tab_rras_municipio ON public.tab_rras (municipio);


-- ================================================================
-- PARTE 7: RPC lc131_distincts — carrega dropdowns separadamente
-- Muito mais leve que lc131_detail pois NÃO retorna linhas,
-- apenas os valores distintos para os filtros cascateados.
-- O frontend chama esta função só quando abre o painel de filtros
-- ou quando um filtro muda — não em cada carregamento.
-- ================================================================
DROP FUNCTION IF EXISTS public.lc131_distincts(integer,text,text,text,text,text,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.lc131_distincts(integer,text,text,text,text,text,text,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.lc131_distincts(
  p_ano           integer DEFAULT NULL,
  p_drs           text    DEFAULT NULL,
  p_regiao_ad     text    DEFAULT NULL,
  p_rras          text    DEFAULT NULL,
  p_regiao_sa     text    DEFAULT NULL,
  p_municipio     text    DEFAULT NULL,
  p_grupo_despesa text    DEFAULT NULL,
  p_tipo_despesa  text    DEFAULT NULL,
  p_rotulo        text    DEFAULT NULL,
  p_fonte_recurso text    DEFAULT NULL,
  p_codigo_ug     text    DEFAULT NULL,
  p_uo            text    DEFAULT NULL,
  p_elemento      text    DEFAULT NULL,
  p_favorecido    text    DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '15s'
AS $$
DECLARE result json;
BEGIN
  WITH filtered AS (
    SELECT
      v.drs,
      v.regiao_ad,
      v.rras,
      v.regiao_sa,
      v.municipio,
      v.codigo_nome_grupo,
      v.tipo_despesa,
      v.rotulo,
      v.codigo_nome_fonte_recurso,
      v.codigo_ug,
      v.codigo_nome_uo,
      v.codigo_nome_elemento,
      v.codigo_nome_favorecido
    FROM public.lc131_enriquecida v
    WHERE
      (p_ano           IS NULL OR v.ano_referencia::text = p_ano::text)
      AND (p_drs           IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_drs, E'\\|') t(val)
            WHERE v.drs ILIKE '%' || trim(t.val) || '%'))
      AND (p_regiao_ad     IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_regiao_ad, E'\\|') t(val)
            WHERE v.regiao_ad ILIKE '%' || trim(t.val) || '%'))
      AND (p_rras          IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_rras, E'\\|') t(val)
            WHERE v.rras ILIKE '%' || trim(t.val) || '%'))
      AND (p_regiao_sa     IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_regiao_sa, E'\\|') t(val)
            WHERE v.regiao_sa ILIKE '%' || trim(t.val) || '%'))
      AND (p_municipio     IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_municipio, E'\\|') t(val)
            WHERE v.municipio ILIKE '%' || trim(t.val) || '%'))
      AND (p_grupo_despesa IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_grupo_despesa, E'\\|') t(val)
            WHERE v.codigo_nome_grupo ILIKE '%' || trim(t.val) || '%'))
      AND (p_tipo_despesa  IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_tipo_despesa, E'\\|') t(val)
            WHERE v.tipo_despesa ILIKE '%' || trim(t.val) || '%'))
      AND (p_rotulo        IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_rotulo, E'\\|') t(val)
            WHERE v.rotulo ILIKE '%' || trim(t.val) || '%'))
      AND (p_fonte_recurso IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_fonte_recurso, E'\\|') t(val)
            WHERE v.codigo_nome_fonte_recurso ILIKE '%' || trim(t.val) || '%'))
      AND (p_codigo_ug     IS NULL OR v.codigo_ug::text = p_codigo_ug)
      AND (p_uo            IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_uo, E'\\|') t(val)
            WHERE v.codigo_nome_uo ILIKE '%' || trim(t.val) || '%'))
      AND (p_elemento      IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_elemento, E'\\|') t(val)
            WHERE v.codigo_nome_elemento ILIKE '%' || trim(t.val) || '%'))
      AND (p_favorecido    IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_favorecido, E'\\|') t(val)
            WHERE v.codigo_nome_favorecido ILIKE '%' || trim(t.val) || '%'))
  )
  SELECT json_build_object(
    'distinct_drs',        (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT drs                       AS d FROM filtered WHERE drs                       IS NOT NULL AND drs <> '') x),
    'distinct_regiao_ad',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT regiao_ad                 AS d FROM filtered WHERE regiao_ad                 IS NOT NULL AND regiao_ad <> '') x),
    'distinct_rras',       (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT rras                      AS d FROM filtered WHERE rras                      IS NOT NULL AND rras <> '') x),
    'distinct_regiao_sa',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT regiao_sa                 AS d FROM filtered WHERE regiao_sa                 IS NOT NULL AND regiao_sa <> '') x),
    'distinct_municipio',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT municipio                 AS d FROM filtered WHERE municipio                 IS NOT NULL AND municipio <> '') x),
    'distinct_grupo',      (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_grupo         AS d FROM filtered WHERE codigo_nome_grupo         IS NOT NULL AND codigo_nome_grupo <> '') x),
    'distinct_tipo',       (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT tipo_despesa              AS d FROM filtered WHERE tipo_despesa              IS NOT NULL AND tipo_despesa <> '') x),
    'distinct_rotulo',     (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT rotulo                    AS d FROM filtered WHERE rotulo                    IS NOT NULL AND rotulo <> '') x),
    'distinct_fonte',      (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_fonte_recurso AS d FROM filtered WHERE codigo_nome_fonte_recurso IS NOT NULL AND codigo_nome_fonte_recurso <> '') x),
    'distinct_codigo_ug',  (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_ug::text           AS d FROM filtered WHERE codigo_ug                 IS NOT NULL) x),
    'distinct_uo',         (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_uo            AS d FROM filtered WHERE codigo_nome_uo            IS NOT NULL AND codigo_nome_uo <> '') x),
    'distinct_elemento',   (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_elemento      AS d FROM filtered WHERE codigo_nome_elemento      IS NOT NULL AND codigo_nome_elemento <> '') x),
    'distinct_favorecido', (SELECT json_agg(d ORDER BY d) FROM (SELECT DISTINCT codigo_nome_favorecido    AS d FROM filtered WHERE codigo_nome_favorecido    IS NOT NULL AND codigo_nome_favorecido <> '') x)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_distincts(integer,text,text,text,text,text,text,text,text,text,text,text,text,text) TO anon, authenticated;


-- ================================================================
-- PARTE 8: RPC lc131_detail atualizada — SEM distincts
-- Remove os 10 subqueries DISTINCT desta função para que ela
-- retorne apenas rows + total (muito mais rápido).
-- Os distincts são agora responsabilidade de lc131_distincts.
-- ================================================================
DROP FUNCTION IF EXISTS public.lc131_detail(integer,text,text,text,text,text,text,text,text,text,text,integer,integer);
DROP FUNCTION IF EXISTS public.lc131_detail(integer,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,integer);

CREATE OR REPLACE FUNCTION public.lc131_detail(
  p_ano           integer DEFAULT NULL,
  p_drs           text    DEFAULT NULL,
  p_regiao_ad     text    DEFAULT NULL,
  p_rras          text    DEFAULT NULL,
  p_regiao_sa     text    DEFAULT NULL,
  p_municipio     text    DEFAULT NULL,
  p_grupo_despesa text    DEFAULT NULL,
  p_tipo_despesa  text    DEFAULT NULL,
  p_rotulo        text    DEFAULT NULL,
  p_fonte_recurso text    DEFAULT NULL,
  p_codigo_ug     text    DEFAULT NULL,
  p_uo            text    DEFAULT NULL,
  p_elemento      text    DEFAULT NULL,
  p_favorecido    text    DEFAULT NULL,
  p_limit         integer DEFAULT 200,
  p_offset        integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '30s'
AS $$
DECLARE result json;
BEGIN
  WITH filtered AS (
    SELECT v.*
    FROM public.lc131_enriquecida v
    WHERE
      (p_ano           IS NULL OR v.ano_referencia::text  = p_ano::text)
      AND (p_drs           IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_drs, E'\\|') t(val)
            WHERE v.drs ILIKE '%' || trim(t.val) || '%'))
      AND (p_regiao_ad     IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_regiao_ad, E'\\|') t(val)
            WHERE v.regiao_ad ILIKE '%' || trim(t.val) || '%'))
      AND (p_rras          IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_rras, E'\\|') t(val)
            WHERE v.rras ILIKE '%' || trim(t.val) || '%'))
      AND (p_regiao_sa     IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_regiao_sa, E'\\|') t(val)
            WHERE v.regiao_sa ILIKE '%' || trim(t.val) || '%'))
      AND (p_municipio     IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_municipio, E'\\|') t(val)
            WHERE v.municipio ILIKE '%' || trim(t.val) || '%'))
      AND (p_grupo_despesa IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_grupo_despesa, E'\\|') t(val)
            WHERE v.codigo_nome_grupo ILIKE '%' || trim(t.val) || '%'))
      AND (p_tipo_despesa  IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_tipo_despesa, E'\\|') t(val)
            WHERE v.tipo_despesa ILIKE '%' || trim(t.val) || '%'))
      AND (p_rotulo        IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_rotulo, E'\\|') t(val)
            WHERE v.rotulo ILIKE '%' || trim(t.val) || '%'))
      AND (p_fonte_recurso IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_fonte_recurso, E'\\|') t(val)
            WHERE v.codigo_nome_fonte_recurso ILIKE '%' || trim(t.val) || '%'))
      AND (p_codigo_ug     IS NULL OR v.codigo_ug::text   = p_codigo_ug)
      AND (p_uo            IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_uo, E'\\|') t(val)
            WHERE v.codigo_nome_uo ILIKE '%' || trim(t.val) || '%'))
      AND (p_elemento      IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_elemento, E'\\|') t(val)
            WHERE v.codigo_nome_elemento ILIKE '%' || trim(t.val) || '%'))
      AND (p_favorecido    IS NULL OR EXISTS (
            SELECT 1 FROM regexp_split_to_table(p_favorecido, E'\\|') t(val)
            WHERE v.codigo_nome_favorecido ILIKE '%' || trim(t.val) || '%'))
  )
  SELECT json_build_object(
    'total', (SELECT COUNT(*) FROM filtered),
    'rows',  (
      SELECT json_agg(r)
      FROM (
        SELECT * FROM filtered
        ORDER BY empenhado DESC NULLS LAST
        LIMIT p_limit OFFSET p_offset
      ) r
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lc131_detail(integer,text,text,text,text,text,text,text,text,text,text,text,text,text,integer,integer) TO anon, authenticated;


-- ================================================================
-- PARTE 9: LIMPEZA DE ENCODING E DEDUPLICAÇÃO NO tab_drs / tab_rras
-- Execute após popular tab_drs e tab_rras para corrigir artefatos
-- de encoding (ex: "AraÃ§atuba" → "Araçatuba") e espaços extras.
-- ================================================================

-- Remove espaços extras nos nomes de DRS
UPDATE public.tab_drs  SET drs   = TRIM(REGEXP_REPLACE(drs,   '\s+', ' ', 'g')) WHERE drs   <> TRIM(REGEXP_REPLACE(drs,   '\s+', ' ', 'g'));
UPDATE public.tab_rras SET rras  = TRIM(REGEXP_REPLACE(rras,  '\s+', ' ', 'g')) WHERE rras  <> TRIM(REGEXP_REPLACE(rras,  '\s+', ' ', 'g'));

-- Remove espaços extras nas chaves (municipio)
UPDATE public.tab_drs  SET municipio = TRIM(municipio) WHERE municipio <> TRIM(municipio);
UPDATE public.tab_rras SET municipio = TRIM(municipio) WHERE municipio <> TRIM(municipio);

-- Verifica nomes de DRS distintos (para detectar duplicatas após correção):
-- SELECT DISTINCT drs FROM public.tab_drs ORDER BY drs;
-- SELECT DISTINCT rras FROM public.tab_rras ORDER BY rras;

-- Verifica municípios com DRS mas sem match na lc131_despesas:
-- SELECT d.municipio, d.drs FROM public.tab_drs d
-- WHERE NOT EXISTS (SELECT 1 FROM public.lc131_despesas lc WHERE lc.nome_municipio = d.municipio);
