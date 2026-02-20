/**
 * TLD Utils - Utilitários para tratamento de domínios e TLDs
 *
 * Biblioteca completa de TLDs de segundo nível para extração correta
 * de domínios raiz em consultas WHOIS e DNS.
 *
 * @module TLDUtils
 */

// ============================================================================
// TLDs de Segundo Nível - Brasil (.br)
// Fonte: registro.br - 147 categorias
// ============================================================================

/** TLDs brasileiros - Genéricos */
const BR_GENERIC = [
  'com.br', 'net.br', 'social.br', 'xyz.br', 'wiki.br', 'etc.br',
];

/** TLDs brasileiros - Negócios */
const BR_BUSINESS = [
  'emp.br', 'ind.br', 'coop.br', 'agr.br', 'far.br', 'imb.br',
  'log.br', 'seg.br', 'srv.br', 'tmp.br', 'tur.br', 'b.br',
];

/** TLDs brasileiros - Cultura */
const BR_CULTURE = [
  'art.br', 'rec.br', 'tv.br', 'am.br', 'fm.br', 'radio.br',
];

/** TLDs brasileiros - Educação */
const BR_EDUCATION = [
  'edu.br', 'esc.br',
];

/** TLDs brasileiros - Pessoais */
const BR_PERSONAL = [
  'blog.br', 'flog.br', 'nom.br', 'vlog.br',
];

/** TLDs brasileiros - Entretenimento */
const BR_ENTERTAINMENT = [
  'esp.br', 'mus.br',
];

/** TLDs brasileiros - Autoridade Pública */
const BR_GOVERNMENT = [
  'gov.br', 'mil.br', 'def.br', 'jus.br', 'leg.br', 'mp.br',
];

/** TLDs brasileiros - Profissões */
const BR_PROFESSIONS = [
  'adm.br', 'adv.br', 'arq.br', 'ato.br', 'bib.br', 'bio.br',
  'bmd.br', 'cim.br', 'cng.br', 'cnt.br', 'coz.br', 'des.br',
  'det.br', 'ecn.br', 'enf.br', 'eng.br', 'eti.br', 'fnd.br',
  'fot.br', 'fst.br', 'geo.br', 'ggf.br', 'jor.br', 'lel.br',
  'mat.br', 'med.br', 'not.br', 'ntr.br', 'odo.br', 'ppg.br',
  'pro.br', 'psc.br', 'rep.br', 'slg.br', 'taxi.br', 'teo.br',
  'trd.br', 'vet.br', 'zlg.br',
];

/** TLDs brasileiros - Tecnologia */
const BR_TECHNOLOGY = [
  'inf.br', 'tec.br', 'app.br', 'dev.br',
];

/** TLDs brasileiros - Terceiro Setor */
const BR_THIRD_SECTOR = [
  'org.br', 'ong.br', 'eco.br',
];

/** TLDs brasileiros - Cidades (principais) */
const BR_CITIES = [
  '9guacu.br', 'abc.br', 'aju.br', 'anani.br', 'aparecida.br',
  'barueri.br', 'belem.br', 'bhz.br', 'boavista.br', 'bsb.br',
  'campinagrande.br', 'campinas.br', 'caxias.br', 'contagem.br',
  'cuiaba.br', 'curitiba.br', 'feira.br', 'floripa.br', 'fortal.br',
  'foz.br', 'goiania.br', 'gru.br', 'jab.br', 'jampa.br', 'jdf.br',
  'joinville.br', 'londrina.br', 'macapa.br', 'maceio.br', 'manaus.br',
  'maringa.br', 'morena.br', 'natal.br', 'niteroi.br', 'osasco.br',
  'palmas.br', 'poa.br', 'pvh.br', 'recife.br', 'ribeirao.br',
  'rio.br', 'riobranco.br', 'riopreto.br', 'salvador.br', 'sampa.br',
  'santamaria.br', 'santoandre.br', 'santos.br', 'saobernardo.br',
  'sjc.br', 'slz.br', 'sorocaba.br', 'the.br', 'udi.br', 'vix.br',
];

// ============================================================================
// TLDs de Segundo Nível - Outros Países
// ============================================================================

/** TLDs Reino Unido (.uk) */
const UK_TLDS = [
  'co.uk', 'org.uk', 'me.uk', 'net.uk', 'ac.uk', 'gov.uk',
  'ltd.uk', 'plc.uk', 'sch.uk', 'nhs.uk', 'police.uk',
];

/** TLDs Austrália (.au) */
const AU_TLDS = [
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au',
  'id.au', 'info.au', 'conf.au', 'oz.au', 'act.au', 'nsw.au',
  'nt.au', 'qld.au', 'sa.au', 'tas.au', 'vic.au', 'wa.au',
];

/** TLDs Nova Zelândia (.nz) */
const NZ_TLDS = [
  'co.nz', 'org.nz', 'net.nz', 'govt.nz', 'ac.nz', 'school.nz',
  'geek.nz', 'gen.nz', 'kiwi.nz', 'maori.nz',
];

/** TLDs Japão (.jp) */
const JP_TLDS = [
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'ad.jp', 'ed.jp',
  'go.jp', 'gr.jp', 'lg.jp',
];

/** TLDs Coreia do Sul (.kr) */
const KR_TLDS = [
  'co.kr', 'or.kr', 'ne.kr', 'go.kr', 'ac.kr', 're.kr',
  'pe.kr', 'hs.kr', 'ms.kr', 'es.kr', 'sc.kr', 'kg.kr',
];

/** TLDs China (.cn) */
const CN_TLDS = [
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'ac.cn',
  'mil.cn', 'bj.cn', 'sh.cn', 'tj.cn', 'cq.cn',
];

/** TLDs Índia (.in) */
const IN_TLDS = [
  'co.in', 'net.in', 'org.in', 'gen.in', 'firm.in', 'ind.in',
  'nic.in', 'ac.in', 'edu.in', 'res.in', 'gov.in', 'mil.in',
];

/** TLDs Portugal (.pt) */
const PT_TLDS = [
  'com.pt', 'org.pt', 'net.pt', 'gov.pt', 'edu.pt', 'nome.pt',
  'publ.pt',
];

/** TLDs Espanha (.es) - não usa second-level, mas incluímos para consistência */
const ES_TLDS = [
  'com.es', 'org.es', 'nom.es', 'gob.es', 'edu.es',
];

/** TLDs Argentina (.ar) */
const AR_TLDS = [
  'com.ar', 'org.ar', 'net.ar', 'gov.ar', 'gob.ar', 'edu.ar',
  'int.ar', 'mil.ar', 'tur.ar',
];

/** TLDs México (.mx) */
const MX_TLDS = [
  'com.mx', 'org.mx', 'net.mx', 'gob.mx', 'edu.mx',
];

/** TLDs Colômbia (.co) */
const CO_TLDS = [
  'com.co', 'org.co', 'net.co', 'gov.co', 'edu.co', 'mil.co',
  'nom.co',
];

/** TLDs Chile (.cl) - não usa second-level comum */
const CL_TLDS = [
  'gob.cl', 'gov.cl',
];

/** TLDs Peru (.pe) */
const PE_TLDS = [
  'com.pe', 'org.pe', 'net.pe', 'gob.pe', 'edu.pe', 'nom.pe',
  'mil.pe',
];

/** TLDs Venezuela (.ve) */
const VE_TLDS = [
  'com.ve', 'org.ve', 'net.ve', 'gov.ve', 'gob.ve', 'edu.ve',
  'mil.ve', 'co.ve', 'info.ve', 'web.ve',
];

/** TLDs Uruguai (.uy) */
const UY_TLDS = [
  'com.uy', 'org.uy', 'net.uy', 'gub.uy', 'edu.uy', 'mil.uy',
];

/** TLDs Paraguai (.py) */
const PY_TLDS = [
  'com.py', 'org.py', 'net.py', 'gov.py', 'edu.py', 'mil.py',
  'coop.py', 'una.py',
];

/** TLDs Alemanha (.de) - não usa second-level */

/** TLDs França (.fr) - não usa second-level comum */
const FR_TLDS = [
  'asso.fr', 'nom.fr', 'prd.fr', 'gouv.fr',
];

/** TLDs Itália (.it) - não usa second-level comum */

/** TLDs Rússia (.ru) - não usa second-level comum */

/** TLDs África do Sul (.za) */
const ZA_TLDS = [
  'co.za', 'org.za', 'net.za', 'gov.za', 'edu.za', 'ac.za',
  'nom.za', 'law.za', 'school.za', 'web.za',
];

/** TLDs Singapura (.sg) */
const SG_TLDS = [
  'com.sg', 'org.sg', 'net.sg', 'gov.sg', 'edu.sg', 'per.sg',
];

/** TLDs Hong Kong (.hk) */
const HK_TLDS = [
  'com.hk', 'org.hk', 'net.hk', 'gov.hk', 'edu.hk', 'idv.hk',
];

/** TLDs Taiwan (.tw) */
const TW_TLDS = [
  'com.tw', 'org.tw', 'net.tw', 'gov.tw', 'edu.tw', 'idv.tw',
  'game.tw', 'ebiz.tw', 'club.tw',
];

/** TLDs Tailândia (.th) */
const TH_TLDS = [
  'co.th', 'or.th', 'net.th', 'go.th', 'ac.th', 'in.th',
  'mi.th',
];

/** TLDs Malásia (.my) */
const MY_TLDS = [
  'com.my', 'org.my', 'net.my', 'gov.my', 'edu.my', 'mil.my',
  'name.my',
];

/** TLDs Indonésia (.id) */
const ID_TLDS = [
  'co.id', 'or.id', 'net.id', 'go.id', 'ac.id', 'sch.id',
  'mil.id', 'web.id', 'my.id', 'biz.id',
];

/** TLDs Filipinas (.ph) */
const PH_TLDS = [
  'com.ph', 'org.ph', 'net.ph', 'gov.ph', 'edu.ph', 'mil.ph',
  'ngo.ph',
];

/** TLDs Vietnã (.vn) */
const VN_TLDS = [
  'com.vn', 'org.vn', 'net.vn', 'gov.vn', 'edu.vn', 'ac.vn',
  'biz.vn', 'info.vn', 'name.vn', 'pro.vn', 'health.vn',
];

/** TLDs Turquia (.tr) */
const TR_TLDS = [
  'com.tr', 'org.tr', 'net.tr', 'gov.tr', 'edu.tr', 'mil.tr',
  'bel.tr', 'pol.tr', 'av.tr', 'dr.tr', 'bbs.tr', 'gen.tr',
  'name.tr', 'tel.tr', 'web.tr', 'info.tr', 'biz.tr', 'k12.tr',
];

/** TLDs Egito (.eg) */
const EG_TLDS = [
  'com.eg', 'org.eg', 'net.eg', 'gov.eg', 'edu.eg', 'sci.eg',
  'eun.eg',
];

/** TLDs Israel (.il) */
const IL_TLDS = [
  'co.il', 'org.il', 'net.il', 'gov.il', 'ac.il', 'k12.il',
  'muni.il', 'idf.il',
];

/** TLDs Emirados Árabes (.ae) */
const AE_TLDS = [
  'co.ae', 'org.ae', 'net.ae', 'gov.ae', 'ac.ae', 'sch.ae',
  'mil.ae', 'pro.ae', 'name.ae',
];

/** TLDs Arábia Saudita (.sa) */
const SA_TLDS = [
  'com.sa', 'org.sa', 'net.sa', 'gov.sa', 'edu.sa', 'med.sa',
  'pub.sa', 'sch.sa',
];

/** TLDs Paquistão (.pk) */
const PK_TLDS = [
  'com.pk', 'org.pk', 'net.pk', 'gov.pk', 'edu.pk', 'fam.pk',
  'biz.pk', 'web.pk', 'gok.pk', 'gob.pk', 'gop.pk', 'gos.pk',
];

/** TLDs Bangladesh (.bd) */
const BD_TLDS = [
  'com.bd', 'org.bd', 'net.bd', 'gov.bd', 'edu.bd', 'ac.bd',
  'mil.bd',
];

/** TLDs Nigéria (.ng) */
const NG_TLDS = [
  'com.ng', 'org.ng', 'net.ng', 'gov.ng', 'edu.ng', 'sch.ng',
  'name.ng', 'mil.ng', 'mobi.ng',
];

/** TLDs Quênia (.ke) */
const KE_TLDS = [
  'co.ke', 'or.ke', 'ne.ke', 'go.ke', 'ac.ke', 'sc.ke',
  'me.ke', 'info.ke',
];

/** TLDs Grécia (.gr) */
const GR_TLDS = [
  'com.gr', 'org.gr', 'net.gr', 'gov.gr', 'edu.gr',
];

/** TLDs Polônia (.pl) */
const PL_TLDS = [
  'com.pl', 'org.pl', 'net.pl', 'gov.pl', 'edu.pl', 'info.pl',
  'biz.pl', 'waw.pl', 'poznan.pl', 'krakow.pl', 'lodz.pl',
];

/** TLDs Ucrânia (.ua) */
const UA_TLDS = [
  'com.ua', 'org.ua', 'net.ua', 'gov.ua', 'edu.ua', 'in.ua',
  'kiev.ua', 'kharkov.ua', 'lviv.ua', 'odessa.ua',
];

/** TLDs República Tcheca (.cz) - não usa second-level comum */

/** TLDs Hungria (.hu) - não usa second-level comum */

/** TLDs Romênia (.ro) - não usa second-level comum */

/** TLDs Irlanda (.ie) */
const IE_TLDS = [
  'gov.ie',
];

/** TLDs Holanda (.nl) - não usa second-level comum */

/** TLDs Bélgica (.be) - não usa second-level comum */

/** TLDs Suíça (.ch) - não usa second-level comum */

/** TLDs Áustria (.at) - não usa second-level comum */
const AT_TLDS = [
  'co.at', 'or.at', 'gv.at', 'ac.at',
];

// ============================================================================
// Lista Consolidada e Funções de Utilidade
// ============================================================================

/**
 * Lista completa de TLDs de segundo nível
 * Ordenada por tamanho (maior primeiro) para matching correto
 */
export const SECOND_LEVEL_TLDS: readonly string[] = [
  // Brasil - todas as categorias
  ...BR_GENERIC, ...BR_BUSINESS, ...BR_CULTURE, ...BR_EDUCATION,
  ...BR_PERSONAL, ...BR_ENTERTAINMENT, ...BR_GOVERNMENT,
  ...BR_PROFESSIONS, ...BR_TECHNOLOGY, ...BR_THIRD_SECTOR,
  ...BR_CITIES,
  // Europa
  ...UK_TLDS, ...PT_TLDS, ...ES_TLDS, ...FR_TLDS, ...GR_TLDS,
  ...PL_TLDS, ...UA_TLDS, ...IE_TLDS, ...AT_TLDS, ...ZA_TLDS,
  // Ásia
  ...JP_TLDS, ...KR_TLDS, ...CN_TLDS, ...IN_TLDS, ...SG_TLDS,
  ...HK_TLDS, ...TW_TLDS, ...TH_TLDS, ...MY_TLDS, ...ID_TLDS,
  ...PH_TLDS, ...VN_TLDS, ...TR_TLDS, ...IL_TLDS, ...AE_TLDS,
  ...SA_TLDS, ...PK_TLDS, ...BD_TLDS,
  // Oceania
  ...AU_TLDS, ...NZ_TLDS,
  // América Latina
  ...AR_TLDS, ...MX_TLDS, ...CO_TLDS, ...CL_TLDS, ...PE_TLDS,
  ...VE_TLDS, ...UY_TLDS, ...PY_TLDS,
  // África
  ...NG_TLDS, ...KE_TLDS, ...EG_TLDS,
].sort((a, b) => b.length - a.length); // Ordena por tamanho decrescente

/**
 * Extrai o domínio raiz de uma URL ou hostname
 * Trata corretamente subdomínios e TLDs de segundo nível
 *
 * @param input - URL completa ou hostname
 * @returns Domínio raiz para consulta WHOIS
 *
 * @example
 * extractRootDomain('https://www.exemplo-advocacia.adv.br') // 'exemplo-advocacia.adv.br'
 * extractRootDomain('sub.example.com.br') // 'example.com.br'
 * extractRootDomain('deep.sub.domain.co.uk') // 'domain.co.uk'
 */
export function extractRootDomain(input: string): string {
  let hostname: string;

  try {
    // Tenta parsear como URL
    const url = new URL(input.includes('://') ? input : `https://${input}`);
    hostname = url.hostname;
  } catch {
    hostname = input;
  }

  // Remove www. se presente
  hostname = hostname.replace(/^www\./, '').toLowerCase();

  // Verifica se termina com TLD de segundo nível
  for (const tld of SECOND_LEVEL_TLDS) {
    if (hostname.endsWith(`.${tld}`)) {
      // Extrai domínio + TLD de segundo nível
      const parts = hostname.split('.');
      const tldParts = tld.split('.').length;
      return parts.slice(-(tldParts + 1)).join('.');
    }
  }

  // Para TLDs simples, pega os últimos 2 segmentos
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    return parts.slice(-2).join('.');
  }

  return hostname;
}

/**
 * Extrai hostname de uma URL
 *
 * @param url - URL completa
 * @returns Hostname sem protocolo
 */
export function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Verifica se um domínio usa TLD de segundo nível
 *
 * @param domain - Domínio para verificar
 * @returns true se usa TLD de segundo nível
 */
export function hasSecondLevelTld(domain: string): boolean {
  const hostname = domain.toLowerCase().replace(/^www\./, '');
  return SECOND_LEVEL_TLDS.some((tld) => hostname.endsWith(`.${tld}`));
}

/**
 * Obtém o TLD de segundo nível de um domínio
 *
 * @param domain - Domínio para analisar
 * @returns TLD de segundo nível ou null
 */
export function getSecondLevelTld(domain: string): string | null {
  const hostname = domain.toLowerCase().replace(/^www\./, '');
  for (const tld of SECOND_LEVEL_TLDS) {
    if (hostname.endsWith(`.${tld}`)) {
      return tld;
    }
  }
  return null;
}

/**
 * Verifica se é um domínio brasileiro (.br)
 *
 * @param domain - Domínio para verificar
 * @returns true se é domínio .br
 */
export function isBrazilianDomain(domain: string): boolean {
  return domain.toLowerCase().endsWith('.br');
}

/**
 * Obtém estatísticas da biblioteca de TLDs
 *
 * @returns Objeto com contagens por região
 */
export function getTldStats(): Record<string, number> {
  return {
    brasil: BR_GENERIC.length + BR_BUSINESS.length + BR_CULTURE.length +
            BR_EDUCATION.length + BR_PERSONAL.length + BR_ENTERTAINMENT.length +
            BR_GOVERNMENT.length + BR_PROFESSIONS.length + BR_TECHNOLOGY.length +
            BR_THIRD_SECTOR.length + BR_CITIES.length,
    europa: UK_TLDS.length + PT_TLDS.length + ES_TLDS.length + FR_TLDS.length +
            GR_TLDS.length + PL_TLDS.length + UA_TLDS.length + IE_TLDS.length +
            AT_TLDS.length,
    asia: JP_TLDS.length + KR_TLDS.length + CN_TLDS.length + IN_TLDS.length +
          SG_TLDS.length + HK_TLDS.length + TW_TLDS.length + TH_TLDS.length +
          MY_TLDS.length + ID_TLDS.length + PH_TLDS.length + VN_TLDS.length +
          TR_TLDS.length + IL_TLDS.length + AE_TLDS.length + SA_TLDS.length +
          PK_TLDS.length + BD_TLDS.length,
    oceania: AU_TLDS.length + NZ_TLDS.length,
    americaLatina: AR_TLDS.length + MX_TLDS.length + CO_TLDS.length +
                   CL_TLDS.length + PE_TLDS.length + VE_TLDS.length +
                   UY_TLDS.length + PY_TLDS.length,
    africa: ZA_TLDS.length + NG_TLDS.length + KE_TLDS.length + EG_TLDS.length,
    total: SECOND_LEVEL_TLDS.length,
  };
}

export default {
  SECOND_LEVEL_TLDS,
  extractRootDomain,
  extractHostname,
  hasSecondLevelTld,
  getSecondLevelTld,
  isBrazilianDomain,
  getTldStats,
};
