-- =======================================================================
-- REBUILD BD_REF + RE-ENRICH ALL DATA
-- Generated from DESPESAS master file (100 unique UGs)
-- Execute in Supabase SQL Editor
-- =======================================================================

-- 1. Truncate bd_ref and re-insert with complete data
TRUNCATE TABLE public.bd_ref RESTART IDENTITY;

INSERT INTO public.bd_ref
  (codigo, unidade, drs, regiao_ad, rras, regiao_sa, cod_ibge, municipio, fonte_recurso, grupo_despesa, tipo_despesa, rotulo)
VALUES
  ('090033', 'FED-CTO. REABILITACAO DE CASA BRANCA', 'DRS XIV - São João da Boa Vista', 'CAMPINAS', '15', 'Rio Pardo', '351080', 'CASA BRANCA', 'DEMAIS FONTES', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090037', 'FED-INSTITUTO ADOLFO LUTZ', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'DEMAIS FONTES', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090038', 'FED-INSTITUTO BUTANTAN', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'DEMAIS FONTES', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090040', 'FED - INSTITUTO DE SAUDE', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'DEMAIS FONTES', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090041', 'FED-INST.DANTE PAZZANESE DE CARDIOLOGIA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'DEMAIS FONTES', 'INVESTIMENTO', 'UNIDADE PRÓPRIA', NULL),
  ('090043', 'FED-INST.INFECTOLOGIA EMILIO RIBAS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'DEMAIS FONTES', 'INVESTIMENTO', 'UNIDADE PRÓPRIA', NULL),
  ('090101', 'GABINETE DO SECRETARIO E ASSESSORIAS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'PESSOAL', 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('090102', 'COORD. GERAL ADMINIST. - CGA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('090105', 'COORD. RECURSOS HUMANOS - CRH', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'PESSOAL', 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('090107', 'CTO. VIGILANCIA SANITARIA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090109', 'CENTRO DE REFERENCIA DA SAUDE DA MULHER', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090110', 'CTO. REFERENCIA E TREINAMENTO-DST/AIDS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090111', 'COORD. DE PLANEJAMENTO DE SAUDE', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'PESSOAL', 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('090112', 'GABINETE DO COORDENADOR', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090113', 'DEPTO.REG.SAUDE - DRS-II ARACATUBA', 'DRS II - Araçatuba', 'ARAÇATUBA', '12', 'Central do DRS II', '350280', 'ARACATUBA', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090115', 'DEPTO.REG.SAUDE - DRS-VI BAURU', 'DRS VI - Bauru', 'BAURU', '9', 'Bauru', '350600', 'BAURU', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090116', 'DEPTO.REG.SAUDE - DRS-IX MARILIA', 'DRS IX - Marília', 'MARILIA', '10', 'Marilia', '352900', 'MARILIA', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090117', 'DEPTO.REG.SAUDE - DRS XI PRES.PRUDENTE', 'DRS XI - Presidente Prudente', 'PRESIDENTE PRUDENTE', '11', 'Alta Sorocabana', '354140', 'PRESIDENTE PRUDENTE', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090118', 'HOSP.GERAL PREF. MIGUEL GUALDA DE PROMISSAO', 'DRS VI - Bauru', 'BAURU', '9', 'Lins', '354160', 'PROMISSAO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090120', 'HOSP.EST. DR.OSWALDO B. FARIA -MIRANDOPOLIS', 'DRS II - Araçatuba', 'ARAÇATUBA', '12', 'Lagos do DRS II', '353010', 'MIRANDOPOLIS', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090121', 'HOSP. REGIONAL DE ASSIS', 'DRS IX - Marília', 'MARILIA', '10', 'Assis', '350400', 'ASSIS', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090122', 'HOSP. DR.ODILO A.SIQUEIRA, P.PRUDENTE', 'DRS XI - Presidente Prudente', 'PRESIDENTE PRUDENTE', '11', 'Alta Sorocabana', '354140', 'PRESIDENTE PRUDENTE', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090123', 'DEPTO.REG.SAUDE DRS-III ARARAQUARA', 'DRS III - Araraquara', 'CENTRAL', '18', 'Central do DRS III', '350320', 'ARARAQUARA', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090124', 'DEPTO.REG.SAUDE - DRS-V BARRETOS', 'DRS V - Barretos', 'BARRETOS', '13', 'Norte - Barretos', '350550', 'BARRETOS', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090125', 'DEPTO.REG.SAUDE - DRS-VIII FRANCA', 'DRS VIII - Franca', 'FRANCA', '13', 'Tres Colinas', '351620', 'FRANCA', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090126', 'DEPTO.REG.SAUDE DRS-XIII RIB.PRETO', 'DRS XIII - Ribeirão Preto', 'RIBEIRÃO PRETO', '13', 'Aquifero Guarani', '354340', 'RIBEIRAO PRETO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090127', 'DEPTO.REG.SAUDE - DRS-XV SJRPRETO', 'DRS XV - São José do Rio Preto', 'SÃO JOSÉ DO RIO PRETO', '12', 'Sao Jose do Rio Preto', '354980', 'SAO JOSE DO RIO PRETO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090128', 'HOSP. NESTOR GOULART REIS', 'DRS III - Araraquara', 'CENTRAL', '18', 'Central do DRS III', '350170', 'AMERICO BRASILIENSE', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090129', 'HOSP. STA.TEREZA, RIB.PRETO', 'DRS XIII - Ribeirão Preto', 'RIBEIRÃO PRETO', '13', 'Aquifero Guarani', '354340', 'RIBEIRAO PRETO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090130', 'CTO.ATENCAO INTEGRAL A SAUDE S.RITA', 'DRS XIII - Ribeirão Preto', 'CENTRAL', '13', 'Aquifero Guarani', '354750', 'SANTA RITA DO PASSA QUATRO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090131', 'DEPTO.REG.SAUDE - DRS-VII CAMPINAS', 'DRS VII - Campinas', 'CAMPINAS', '15', 'Reg Metro Campinas', '350950', 'CAMPINAS', 'TESOURO', 'PESSOAL', 'UNIDADE PRÓPRIA', NULL),
  ('090132', 'DEPTO.REG.SAUDE - DRS-X PIRACICABA', 'DRS X - Piracicaba', 'CAMPINAS', '14', 'Piracicaba', '353870', 'PIRACICABA', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090133', 'DEPTO.REG.SAUDE - DRS-XIV SJBOA VISTA', 'DRS XIV - São João da Boa Vista', 'CAMPINAS', '15', 'Mantiqueira', '354910', 'SAO JOAO DA BOA VISTA', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090135', 'DEPTO.REG.SAUDE DE TAUBATE - DRS-XVII', 'DRS XVII - Taubaté', 'SÃO JOSÉ DOS CAMPOS', '17', 'V. Paraiba-Reg. Serrana', '355410', 'TAUBATE', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090137', 'DEPTO.REG.SAUDE - DRS-XII REGISTRO', 'DRS XII - Registro', 'REGISTRO', '7', 'Vale do Ribeira', '354260', 'REGISTRO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090138', 'DEPTO.REG.SAUDE - DRS-IV BAIXADA SANTISTA', 'DRS IV - Baixada Santista', 'LITORAL NORTE', '7', 'Baixada Santista', '354850', 'SANTOS', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090139', 'DEPTO.REG.SAUDE - DRS-XVI SOROCABA', 'DRS XVI - Sorocaba', 'SOROCABA', '8', 'Sorocaba', '355220', 'SOROCABA', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090140', 'HOSP.DR.LEONARDO BEVILACQUA-PARIQUERA-ACU', 'DRS XII - Registro', 'REGISTRO', '7', 'Vale do Ribeira', '353620', 'PARIQUERA-ACU', 'TESOURO', 'PESSOAL', 'UNIDADE PRÓPRIA', NULL),
  ('090141', 'HOSP. GUILHERME ALVARO, SANTOS', 'DRS IV - Baixada Santista', 'LITORAL NORTE', '7', 'Baixada Santista', '354850', 'SANTOS', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090143', 'CONJ. HOSPITALAR DE SOROCABA', 'DRS XVI - Sorocaba', 'SOROCABA', '8', 'Sorocaba', '355220', 'SOROCABA', 'TESOURO', 'PESSOAL', 'UNIDADE PRÓPRIA', NULL),
  ('090145', 'CAIS - PROF. CANTIDIO DE MOURA CAMPOS', 'DRS VI - Bauru', 'SOROCABA', '9', 'Polo Cuesta', '350750', 'BOTUCATU', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090146', 'CTO. REABILITACAO DE CASA BRANCA', 'DRS XIV - São João da Boa Vista', 'CAMPINAS', '15', 'Rio Pardo', '351080', 'CASA BRANCA', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090147', 'CAIS - CLEMENTE FERREIRA, LINS', 'DRS VI - Bauru', 'BAURU', '9', 'Lins', '352710', 'LINS', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090148', 'GABINETE DO COORDENADOR', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090149', 'DEPTO. GERENC. AMBULATORIAL DA CAPITAL-DGAC', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090154', 'HOSP. GERAL DE VILA NOVA CACHOEIRINHA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'FEDERAL', 'INVESTIMENTO', 'UNIDADE PRÓPRIA', NULL),
  ('090155', 'HOSPITAL GERAL DE TAIPAS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090156', 'HOSP. GERAL DR.JOSE PANGELLA DE VILA PENTEAD', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'PESSOAL', 'UNIDADE PRÓPRIA', NULL),
  ('090157', 'HOSP. REGIONAL SUL', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'PESSOAL', 'UNIDADE PRÓPRIA', NULL),
  ('090158', 'HOSP.GERAL J.TEIXEIRA DA COSTA,EM GUAIANASES', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090159', 'HOSP. GERAL S.MATEUS, DR.MANOEL BIFULCO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090160', 'UN. GESTAO ASSISTENCIAL I-HOSP. HELIOPOLIS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090161', 'UN. GESTAO ASSISTENCIAL II-HOSP. IPIRANGA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090162', 'UN. GESTAO ASSIST.III - HOSP.INF.DARCY VARGA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090163', 'UN. GESTAO ASSIST. IV-HOSP.MAT.L.M.BARROS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090164', 'UN. GESTAO ASSISTENCIAL V-HOSP. BRIGADEIRO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'PESSOAL', 'UNIDADE PRÓPRIA', NULL),
  ('090165', 'COMPLEXO HOSP.DO JUQUERY, EM FRANCO DA ROCHA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '3', 'Franco da Rocha', '351640', 'FRANCO DA ROCHA', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090166', 'HOSP.REG.DR.O.F.COELHO,EM F.DE VASCONCELOS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '2', 'Alto do Tiete', '351570', 'FERRAZ DE VASCONCELOS', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090167', 'HOSP. REG. DR.VIVALDO M.SIMOES, OSASCO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '5', 'Rota dos Bandeirantes', '353440', 'OSASCO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090168', 'HOSP.MAT.INTERLAGOS-WALDEMAR SEYSSEL-ARRELIA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090169', 'HOSP. INFANTIL CANDIDO FONTOURA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090170', 'CTO.AT.INTEG.SAUDE MENTAL-DR.DAVID C.C.FILHO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090171', 'COMPLEXO HOSP. PE.BENTO, DE GUARULHOS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '2', 'Alto do Tiete', '351880', 'GUARULHOS', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090172', 'CONJUNTO HOSPITALAR DO MANDAQUI-CHM', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090173', 'CTO.ATENCAO INTEGRADA EM SAUDE MENTAL-P.PINE', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090175', 'CTO.ESPECIALIZ. REABILITACAO DR. APC-M.CRUZE', 'DRS I - Grande São Paulo', 'SÃO PAULO', '2', 'Alto do Tiete', '353060', 'MOGI DAS CRUZES', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090176', 'GABINETE DO COORDENADOR', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090177', 'INSTITUTO ADOLFO LUTZ', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090178', 'INSTITUTO BUTANTAN', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090179', 'INSTITUTO PASTEUR', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090180', 'INSTITUTO DE SAUDE', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090181', 'INSTITUTO DANTE PAZZANESE DE CARDIOLOGIA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'PESSOAL', 'UNIDADE PRÓPRIA', NULL),
  ('090182', 'INST. LAURO DE SOUZA LIMA, EM BAURU', 'DRS VI - Bauru', 'BAURU', '9', 'Bauru', '350600', 'BAURU', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090183', 'INST. INFECTOLOGIA EMILIO RIBAS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090184', 'HOSP. DAS CLINICAS LUZIA DE PINHO MELO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '2', 'Alto do Tiete', '353060', 'MOGI DAS CRUZES', 'TESOURO', 'PESSOAL', 'UNIDADE PRÓPRIA', NULL),
  ('090186', 'CENTRO PIONEIRO EM ATENCAO PSICOSSOCIAL-AJJE', 'DRS I - Grande São Paulo', 'SÃO PAULO', '3', 'Franco da Rocha', '351640', 'FRANCO DA ROCHA', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090187', 'INST.PAULISTA DE GERIATRIA E GERONTOLOG.-IPG', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090188', 'CTO REF. ALCOOL, TABACO E OUTRAS DROGAS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090189', 'GABINETE DO COORDENADOR', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'PESSOAL', 'UNIDADE PRÓPRIA', NULL),
  ('090190', 'INSTITUTO CLEMENTE FERREIRA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090191', 'DEPTO.REG.GRANDE SAO PAULO - DRS-I G.S.PAULO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090192', 'GABINETE DO COORDENADOR', 'DRS XV - São José do Rio Preto', 'SÃO JOSÉ DO RIO PRETO', '12', 'Fernandopolis', '351550', 'FERNANDOPOLIS', 'TESOURO', 'CUSTEIO', 'ORGANIZAÇÃO SOCIAL', NULL),
  ('090193', 'GRUPO DE GERENCIAMENTO ADMINISTRATIVO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'FEDERAL', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090194', 'CTO.VIGIL. EPIDEMIOLOGICA PROF.A.VRANJAC-CVE', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'FEDERAL', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090195', 'SECR.EXECUTIVA CONSELHO ADMINISTRATIVO-FESIM', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'FEDERAL', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090196', 'COORD. DE GESTAO ORCAMENTARIA E FINANCEIRA', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'CONVÊNIO', NULL),
  ('090200', 'GRUPO DE RESGATE - GRAU', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090201', 'GABINETE DO COORDENADOR', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090202', 'GRUPO DE GERENCI.DEMANDAS POR MEDICAMENTOS', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'FEDERAL', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090203', 'HOSP.EST.ESPEC.REAB.DR.FRANCISCO R.ARANTES', 'DRS XVI - Sorocaba', 'SOROCABA', '8', 'Sorocaba', '352390', 'ITU', 'TESOURO', 'CUSTEIO', 'UNIDADE PRÓPRIA', NULL),
  ('090205', 'GABINETE DO COORDENADOR', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'INVESTIMENTO', 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('091101', 'FUND.P/REMEDIO POPULAR-CHOPIN TAVARES DE LIM', 'DRS I - Grande São Paulo', 'SÃO PAULO', '2', 'Alto do Tiete', '351880', 'GUARULHOS', 'TESOURO', 'CUSTEIO', 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('091102', 'FUND.P/REM.POPULAR-CHOPIN T. DE LIMA-FURP-AB', 'DRS I - Grande São Paulo', 'SÃO PAULO', '2', 'Alto do Tiete', '351880', 'GUARULHOS', 'TESOURO', 'PESSOAL', 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('091201', 'FUNDACAO ONCOCENTRO DE SAO PAULO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'FEDERAL', 'CUSTEIO', 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('091301', 'FUND. PRO-SANGUE HEMOCENTRO SP.', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'DEMAIS FONTES', 'CUSTEIO', 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('092101', 'SUPERIN. DE CONTROLE DE ENDEMIAS-SUCEN', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('092201', 'HOSP. DAS CLINICAS, RIB.PRETO', 'DRS XIII - Ribeirão Preto', 'RIBEIRÃO PRETO', '13', 'Aquifero Guarani', '354340', 'RIBEIRAO PRETO', 'TESOURO', 'CUSTEIO', 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('092301', 'HOSP. DAS CLINICAS, SAO PAULO', 'DRS I - Grande São Paulo', 'SÃO PAULO', '6', 'Sao Paulo', '355030', 'SAO PAULO', 'TESOURO', 'CUSTEIO', 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('092501', 'HOSP. DAS CLINICAS, BOTUCATU', 'DRS VI - Bauru', 'SOROCABA', '9', 'Polo Cuesta', '350750', 'BOTUCATU', 'TESOURO', 'CUSTEIO', 'TRANFERÊNCIA VOLUNTÁRIA', NULL),
  ('092601', 'HOSP. CLINICAS FAC.MED.MARILIA - HCFAMEMA', 'DRS IX - Marília', 'MARILIA', '10', 'Marilia', '352900', 'MARILIA', 'TESOURO', 'CUSTEIO', 'TRANFERÊNCIA VOLUNTÁRIA', NULL);

-- Verify
SELECT COUNT(*) AS bd_ref_count FROM public.bd_ref;

-- 2. No need to clear enriched columns — the ~400k rows already have NULL
-- for tipo_despesa, unidade, regiao_ad, regiao_sa, cod_ibge.
-- The updated candidate query below will pick them up automatically.

-- 3. Recreate enrichment function with improved fallbacks
CREATE OR REPLACE FUNCTION public.refresh_dashboard_batch(p_batch_size integer DEFAULT 5000)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET statement_timeout = 600000
AS $$
DECLARE rows_affected bigint;
BEGIN
  WITH candidates AS (
    SELECT id FROM lc131_despesas
    WHERE COALESCE(TRIM(drs),'') = ''
       OR COALESCE(TRIM(rotulo),'') = ''
       OR COALESCE(TRIM(tipo_despesa),'') = ''
       OR COALESCE(TRIM(unidade),'') = ''
       OR COALESCE(TRIM(regiao_ad),'') = ''
    LIMIT p_batch_size
  ),
  enriched AS (
    SELECT
      lc.id,
      -- DRS: tab_drs first (by nome_municipio or municipio), then bd_ref
      NULLIF(TRIM(COALESCE(td.drs, td2.drs, rb1.drs, rb2.drs, rb3.drs)), '')  AS e_drs,
      -- RRAS: tab_rras first, then bd_ref
      NULLIF(TRIM(COALESCE(tr.rras, tr2.rras, rb1.rras, rb2.rras, rb3.rras)), '') AS e_rras,
      -- Região Administrativa: bd_ref
      COALESCE(rb1.regiao_ad, rb2.regiao_ad, rb3.regiao_ad)     AS e_regiao_ad,
      -- Região de Saúde: bd_ref
      COALESCE(rb1.regiao_sa, rb2.regiao_sa, rb3.regiao_sa)     AS e_regiao_sa,
      -- Cód IBGE: bd_ref
      COALESCE(rb1.cod_ibge, rb2.cod_ibge, rb3.cod_ibge)        AS e_cod_ibge,
      -- Município: use nome_municipio from LC131, then bd_ref
      COALESCE(NULLIF(TRIM(lc.nome_municipio),''), rb1.municipio, rb2.municipio, rb3.municipio) AS e_municipio,
      -- Unidade: bd_ref first, then derive from codigo_nome_ug
      COALESCE(rb1.unidade, rb2.unidade, rb3.unidade,
        NULLIF(TRIM(regexp_replace(lc.codigo_nome_ug::text, '^\d+\s*-\s*', '')), '')
      ) AS e_unidade,
      -- Fonte recurso: bd_ref
      COALESCE(rb1.fonte_recurso, rb2.fonte_recurso, rb3.fonte_recurso) AS e_fonte_recurso,
      -- Grupo despesa: bd_ref, fallback to codigo_nome_grupo
      COALESCE(rb1.grupo_despesa, rb2.grupo_despesa, rb3.grupo_despesa,
        lc.codigo_nome_grupo) AS e_grupo_despesa,
      -- Tipo despesa: bd_ref
      COALESCE(rb1.tipo_despesa, rb2.tipo_despesa, rb3.tipo_despesa) AS e_tipo_despesa,
      -- Rótulo: bd_ref, fallback heuristic from codigo_nome_projeto_atividade
      COALESCE(rb1.rotulo, rb2.rotulo, rb3.rotulo,
        CASE
          WHEN lc.codigo_nome_projeto_atividade ~* 'ambulat|hospitalar' THEN 'Assistência Hospitalar'
          WHEN lc.codigo_nome_projeto_atividade ~* 'farmac' THEN 'Assistência Farmacêutica'
          WHEN lc.codigo_nome_projeto_atividade ~* 'vigil.*sanit' THEN 'Vigilância Sanitária'
          WHEN lc.codigo_nome_projeto_atividade ~* 'vigil.*epidem|endem' THEN 'Vigilância Epidemiológica'
          WHEN lc.codigo_nome_projeto_atividade ~* 'imuniz' THEN 'Imunização'
          WHEN lc.codigo_nome_projeto_atividade ~* 'atenc.*bas|atencao.*prim' THEN 'Atenção Básica'
          WHEN lc.codigo_nome_projeto_atividade ~* 'mental|psiq' THEN 'Saúde Mental'
          WHEN lc.codigo_nome_projeto_atividade ~* 'apoio.*admin|administrativ' THEN 'Apoio Administrativo'
          WHEN lc.codigo_nome_projeto_atividade ~* 'reform|ampl|aparelh|equipam' THEN 'Investimento/Infraestrutura'
          WHEN lc.codigo_nome_projeto_atividade ~* 'emenda' THEN 'Emendas Parlamentares'
          WHEN lc.codigo_nome_projeto_atividade ~* 'laborat' THEN 'Laboratório'
          WHEN lc.codigo_nome_projeto_atividade ~* 'sangue|hemot' THEN 'Hemoterapia'
          WHEN lc.codigo_nome_projeto_atividade ~* 'oncol|cancer' THEN 'Oncologia'
          ELSE 'Outros'
        END
      ) AS e_rotulo
    FROM lc131_despesas lc
    INNER JOIN candidates c ON c.id = lc.id
    -- JOINs with tab_drs by municipio
    LEFT JOIN tab_drs  td   ON td.municipio  = norm_munic(lc.nome_municipio)
    LEFT JOIN tab_drs  td2  ON td2.municipio = norm_munic(lc.municipio)
    -- JOINs with tab_rras by municipio
    LEFT JOIN tab_rras tr   ON tr.municipio  = norm_munic(lc.nome_municipio)
    LEFT JOIN tab_rras tr2  ON tr2.municipio = norm_munic(lc.municipio)
    -- JOIN1: bd_ref by codigo_projeto_atividade
    LEFT JOIN bd_ref rb1 ON rb1.codigo = LPAD(lc.codigo_projeto_atividade::text, 6, '0')
    -- JOIN2: bd_ref by codigo_ug
    LEFT JOIN bd_ref rb2 ON rb2.codigo = LPAD(lc.codigo_ug::text, 6, '0')
    -- JOIN3: bd_ref by numeric prefix of codigo_nome_ug
    LEFT JOIN bd_ref rb3 ON rb3.codigo = LPAD(
        NULLIF(regexp_replace(split_part(lc.codigo_nome_ug::text,' ',1),'[^0-9]','','g'),''),
        6, '0')
  )
  UPDATE lc131_despesas tgt SET
    drs           = COALESCE(enriched.e_drs,           NULLIF(TRIM(tgt.drs),'')),
    rras          = COALESCE(enriched.e_rras,          NULLIF(TRIM(tgt.rras),'')),
    regiao_ad     = COALESCE(enriched.e_regiao_ad,     NULLIF(TRIM(tgt.regiao_ad),'')),
    regiao_sa     = COALESCE(enriched.e_regiao_sa,     NULLIF(TRIM(tgt.regiao_sa),'')),
    cod_ibge      = COALESCE(enriched.e_cod_ibge,      NULLIF(TRIM(tgt.cod_ibge),'')),
    municipio     = COALESCE(enriched.e_municipio,     NULLIF(TRIM(tgt.municipio),'')),
    unidade       = COALESCE(enriched.e_unidade,       NULLIF(TRIM(tgt.unidade),'')),
    fonte_recurso = COALESCE(enriched.e_fonte_recurso, NULLIF(TRIM(tgt.fonte_recurso),'')),
    grupo_despesa = COALESCE(enriched.e_grupo_despesa, NULLIF(TRIM(tgt.grupo_despesa),'')),
    tipo_despesa  = COALESCE(enriched.e_tipo_despesa,  NULLIF(TRIM(tgt.tipo_despesa),'')),
    rotulo        = COALESCE(enriched.e_rotulo,        NULLIF(TRIM(tgt.rotulo),'')),
    pago_total    = COALESCE(tgt.pago, 0) + COALESCE(tgt.pago_anos_anteriores, 0)
  FROM enriched WHERE tgt.id = enriched.id;
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected;
END;
$$;

-- 4. Recreate wrapper that calls batch in loop
CREATE OR REPLACE FUNCTION public.refresh_dashboard()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public SET statement_timeout = 0
AS $$
DECLARE n bigint;
BEGIN
  LOOP
    n := refresh_dashboard_batch(5000);
    RAISE NOTICE 'Batch enriched % rows', n;
    EXIT WHEN n = 0;
  END LOOP;
END;
$$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
