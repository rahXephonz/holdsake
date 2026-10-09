// Generated 2026-10-07: hookless Uniswap v4 pools pairing a Stock Token with USDG that held
// liquidity then (PoolManager Initialize events, liquidity read through StateView), with a pool
// fee of at most 5%, up to three per stock, deepest first. Many stocks only have real depth at 2-5%.
// Left out on purpose: hooked pools (a hook runs its own code on every swap) and the lookalike
// pools charging 50-96% at made-up prices. The app re-reads liquidity live, values a stock at its
// deepest pool and trades through whichever candidate quotes best. Regenerate, don't hand-edit.

/** Uniswap fee units: hundredths of a basis point, so 50_000 is 5% */
export const MAX_POOL_FEE = 50_000

export const STOCK_POOL_CANDIDATES: Record<
  string,
  readonly { fee: number; tickSpacing: number }[]
> = {
  AAOI: [
    { fee: 49000, tickSpacing: 490 },
    { fee: 50000, tickSpacing: 500 },
    { fee: 10000, tickSpacing: 200 },
  ],
  AAPL: [
    { fee: 3000, tickSpacing: 60 },
    { fee: 10000, tickSpacing: 200 },
    { fee: 15100, tickSpacing: 151 },
  ],
  ABCL: [{ fee: 50000, tickSpacing: 500 }],
  ADBE: [
    { fee: 9900, tickSpacing: 99 },
    { fee: 40000, tickSpacing: 400 },
    { fee: 2000, tickSpacing: 20 },
  ],
  AEHR: [
    { fee: 47000, tickSpacing: 470 },
    { fee: 50000, tickSpacing: 500 },
  ],
  ALAB: [
    { fee: 10050, tickSpacing: 101 },
    { fee: 50000, tickSpacing: 500 },
  ],
  AMAT: [{ fee: 50000, tickSpacing: 500 }],
  AMBA: [
    { fee: 50000, tickSpacing: 500 },
    { fee: 45000, tickSpacing: 450 },
    { fee: 20000, tickSpacing: 200 },
  ],
  AMC: [
    { fee: 1000, tickSpacing: 10 },
    { fee: 20000, tickSpacing: 200 },
    { fee: 40000, tickSpacing: 400 },
  ],
  AMD: [
    { fee: 10000, tickSpacing: 200 },
    { fee: 375, tickSpacing: 4 },
  ],
  AMKR: [
    { fee: 49000, tickSpacing: 490 },
    { fee: 50000, tickSpacing: 500 },
    { fee: 2500, tickSpacing: 25 },
  ],
  AMZN: [
    { fee: 2400, tickSpacing: 24 },
    { fee: 3000, tickSpacing: 60 },
    { fee: 2500, tickSpacing: 25 },
  ],
  ANET: [{ fee: 50000, tickSpacing: 500 }],
  APLD: [
    { fee: 46000, tickSpacing: 460 },
    { fee: 10000, tickSpacing: 100 },
  ],
  APP: [
    { fee: 5000, tickSpacing: 50 },
    { fee: 32800, tickSpacing: 328 },
    { fee: 10000, tickSpacing: 100 },
  ],
  ASML: [
    { fee: 7000, tickSpacing: 70 },
    { fee: 4000, tickSpacing: 40 },
    { fee: 31000, tickSpacing: 200 },
  ],
  ASTS: [{ fee: 25000, tickSpacing: 250 }],
  AUR: [
    { fee: 40000, tickSpacing: 400 },
    { fee: 10000, tickSpacing: 100 },
    { fee: 50000, tickSpacing: 500 },
  ],
  AVAV: [{ fee: 50000, tickSpacing: 500 }],
  AVGO: [{ fee: 10000, tickSpacing: 100 }],
  AXON: [
    { fee: 2500, tickSpacing: 25 },
    { fee: 50000, tickSpacing: 500 },
  ],
  AXTI: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 47000, tickSpacing: 470 },
  ],
  BA: [
    { fee: 2000, tickSpacing: 20 },
    { fee: 9900, tickSpacing: 99 },
    { fee: 29900, tickSpacing: 299 },
  ],
  BABA: [
    { fee: 1000, tickSpacing: 10 },
    { fee: 9000, tickSpacing: 90 },
    { fee: 50000, tickSpacing: 500 },
  ],
  BB: [
    { fee: 7100, tickSpacing: 71 },
    { fee: 5000, tickSpacing: 50 },
    { fee: 7500, tickSpacing: 75 },
  ],
  BE: [
    { fee: 19000, tickSpacing: 190 },
    { fee: 45000, tickSpacing: 450 },
    { fee: 50000, tickSpacing: 1000 },
  ],
  BULL: [
    { fee: 8000, tickSpacing: 50 },
    { fee: 30000, tickSpacing: 300 },
    { fee: 25000, tickSpacing: 250 },
  ],
  CBRS: [{ fee: 10000, tickSpacing: 100 }],
  CCL: [{ fee: 50000, tickSpacing: 500 }],
  CEG: [
    { fee: 9000, tickSpacing: 90 },
    { fee: 50000, tickSpacing: 500 },
  ],
  CELH: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 48000, tickSpacing: 480 },
  ],
  CIEN: [{ fee: 50000, tickSpacing: 500 }],
  CLOV: [
    { fee: 9000, tickSpacing: 90 },
    { fee: 48800, tickSpacing: 1 },
  ],
  CLS: [{ fee: 50000, tickSpacing: 500 }],
  CLSK: [
    { fee: 46800, tickSpacing: 468 },
    { fee: 50000, tickSpacing: 500 },
  ],
  COHR: [{ fee: 50000, tickSpacing: 500 }],
  COIN: [
    { fee: 10000, tickSpacing: 200 },
    { fee: 2500, tickSpacing: 25 },
    { fee: 9000, tickSpacing: 90 },
  ],
  COST: [
    { fee: 880, tickSpacing: 9 },
    { fee: 2000, tickSpacing: 20 },
    { fee: 1000, tickSpacing: 10 },
  ],
  CRCL: [
    { fee: 3000, tickSpacing: 30 },
    { fee: 1500, tickSpacing: 15 },
    { fee: 2450, tickSpacing: 25 },
  ],
  CRDO: [{ fee: 48000, tickSpacing: 480 }],
  CRM: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 30000, tickSpacing: 300 },
  ],
  CRWD: [
    { fee: 28456, tickSpacing: 285 },
    { fee: 29450, tickSpacing: 295 },
    { fee: 30100, tickSpacing: 301 },
  ],
  CRWV: [
    { fee: 9000, tickSpacing: 90 },
    { fee: 2500, tickSpacing: 25 },
    { fee: 31000, tickSpacing: 200 },
  ],
  CSCO: [
    { fee: 50000, tickSpacing: 500 },
    { fee: 48000, tickSpacing: 480 },
  ],
  CTSH: [{ fee: 50000, tickSpacing: 500 }],
  CVNA: [{ fee: 20000, tickSpacing: 200 }],
  DDOG: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 38560, tickSpacing: 386 },
    { fee: 35800, tickSpacing: 358 },
  ],
  DELL: [
    { fee: 5000, tickSpacing: 25 },
    { fee: 50000, tickSpacing: 1000 },
    { fee: 9000, tickSpacing: 90 },
  ],
  DJT: [
    { fee: 2057, tickSpacing: 21 },
    { fee: 1420, tickSpacing: 14 },
    { fee: 2000, tickSpacing: 20 },
  ],
  DOCN: [{ fee: 50000, tickSpacing: 500 }],
  ELF: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 20100, tickSpacing: 201 },
    { fee: 46180, tickSpacing: 461 },
  ],
  EWT: [{ fee: 50000, tickSpacing: 500 }],
  EWY: [
    { fee: 50000, tickSpacing: 500 },
    { fee: 2200, tickSpacing: 22 },
    { fee: 19990, tickSpacing: 200 },
  ],
  F: [
    { fee: 2800, tickSpacing: 28 },
    { fee: 32000, tickSpacing: 320 },
    { fee: 7000, tickSpacing: 70 },
  ],
  FICO: [
    { fee: 2500, tickSpacing: 25 },
    { fee: 10000, tickSpacing: 100 },
    { fee: 50000, tickSpacing: 500 },
  ],
  FIG: [
    { fee: 20000, tickSpacing: 100 },
    { fee: 2000, tickSpacing: 20 },
    { fee: 43000, tickSpacing: 430 },
  ],
  FISV: [
    { fee: 9000, tickSpacing: 90 },
    { fee: 50000, tickSpacing: 500 },
  ],
  FIX: [
    { fee: 50000, tickSpacing: 500 },
    { fee: 30000, tickSpacing: 300 },
    { fee: 10000, tickSpacing: 100 },
  ],
  FLNC: [
    { fee: 40000, tickSpacing: 400 },
    { fee: 50000, tickSpacing: 500 },
  ],
  FLY: [
    { fee: 20000, tickSpacing: 200 },
    { fee: 35890, tickSpacing: 359 },
    { fee: 32000, tickSpacing: 320 },
  ],
  FTNT: [
    { fee: 30000, tickSpacing: 300 },
    { fee: 50000, tickSpacing: 500 },
  ],
  FUTU: [
    { fee: 45000, tickSpacing: 450 },
    { fee: 10000, tickSpacing: 100 },
  ],
  GE: [
    { fee: 20000, tickSpacing: 200 },
    { fee: 18000, tickSpacing: 180 },
    { fee: 9500, tickSpacing: 95 },
  ],
  GEV: [
    { fee: 40000, tickSpacing: 400 },
    { fee: 50000, tickSpacing: 500 },
  ],
  GLD: [
    { fee: 2100, tickSpacing: 21 },
    { fee: 3000, tickSpacing: 60 },
  ],
  GLW: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 45000, tickSpacing: 450 },
    { fee: 50000, tickSpacing: 500 },
  ],
  GLXY: [
    { fee: 5000, tickSpacing: 25 },
    { fee: 10000, tickSpacing: 100 },
    { fee: 30600, tickSpacing: 306 },
  ],
  GME: [
    { fee: 9800, tickSpacing: 98 },
    { fee: 10000, tickSpacing: 200 },
    { fee: 2120, tickSpacing: 42 },
  ],
  GOOGL: [
    { fee: 3000, tickSpacing: 60 },
    { fee: 3499, tickSpacing: 60 },
    { fee: 300, tickSpacing: 3 },
  ],
  HII: [{ fee: 30000, tickSpacing: 300 }],
  HIMS: [
    { fee: 9000, tickSpacing: 90 },
    { fee: 3000, tickSpacing: 30 },
    { fee: 8588, tickSpacing: 86 },
  ],
  HPE: [
    { fee: 30000, tickSpacing: 1 },
    { fee: 43500, tickSpacing: 435 },
  ],
  HWM: [
    { fee: 48000, tickSpacing: 480 },
    { fee: 10000, tickSpacing: 100 },
    { fee: 50000, tickSpacing: 500 },
  ],
  IBM: [
    { fee: 1500, tickSpacing: 15 },
    { fee: 9000, tickSpacing: 90 },
    { fee: 6500, tickSpacing: 65 },
  ],
  IBRX: [
    { fee: 50000, tickSpacing: 500 },
    { fee: 48000, tickSpacing: 480 },
  ],
  INDA: [
    { fee: 2000, tickSpacing: 20 },
    { fee: 48598, tickSpacing: 486 },
    { fee: 49800, tickSpacing: 498 },
  ],
  INFQ: [{ fee: 50000, tickSpacing: 500 }],
  INOD: [
    { fee: 35000, tickSpacing: 350 },
    { fee: 10000, tickSpacing: 100 },
    { fee: 49800, tickSpacing: 498 },
  ],
  INTC: [{ fee: 10000, tickSpacing: 200 }],
  INTU: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 50000, tickSpacing: 500 },
  ],
  IONQ: [
    { fee: 40000, tickSpacing: 400 },
    { fee: 50000, tickSpacing: 500 },
  ],
  IREN: [
    { fee: 9000, tickSpacing: 90 },
    { fee: 50000, tickSpacing: 500 },
  ],
  JBL: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 50000, tickSpacing: 500 },
    { fee: 48000, tickSpacing: 480 },
  ],
  JNJ: [
    { fee: 50000, tickSpacing: 500 },
    { fee: 33330, tickSpacing: 333 },
    { fee: 4999, tickSpacing: 50 },
  ],
  JOBY: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 50000, tickSpacing: 500 },
    { fee: 25000, tickSpacing: 250 },
  ],
  KLAC: [
    { fee: 40000, tickSpacing: 400 },
    { fee: 50000, tickSpacing: 500 },
  ],
  KSS: [
    { fee: 49000, tickSpacing: 490 },
    { fee: 10000, tickSpacing: 10 },
  ],
  KTOS: [
    { fee: 2500, tickSpacing: 25 },
    { fee: 50000, tickSpacing: 500 },
  ],
  LHX: [{ fee: 50000, tickSpacing: 500 }],
  LITE: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 50000, tickSpacing: 500 },
  ],
  LLY: [
    { fee: 810, tickSpacing: 8 },
    { fee: 9000, tickSpacing: 90 },
    { fee: 7000, tickSpacing: 1 },
  ],
  LMT: [
    { fee: 5000, tickSpacing: 50 },
    { fee: 47000, tickSpacing: 470 },
  ],
  LRCX: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 39500, tickSpacing: 395 },
    { fee: 50000, tickSpacing: 500 },
  ],
  LULU: [
    { fee: 9023, tickSpacing: 90 },
    { fee: 3477, tickSpacing: 35 },
    { fee: 2800, tickSpacing: 28 },
  ],
  LUNR: [{ fee: 50000, tickSpacing: 500 }],
  MDB: [
    { fee: 38400, tickSpacing: 384 },
    { fee: 10000, tickSpacing: 100 },
    { fee: 50000, tickSpacing: 500 },
  ],
  META: [
    { fee: 3000, tickSpacing: 60 },
    { fee: 310, tickSpacing: 3 },
    { fee: 520, tickSpacing: 5 },
  ],
  MOD: [
    { fee: 40000, tickSpacing: 260 },
    { fee: 50000, tickSpacing: 500 },
  ],
  MPWR: [
    { fee: 30000, tickSpacing: 300 },
    { fee: 50000, tickSpacing: 500 },
  ],
  MRNA: [
    { fee: 7800, tickSpacing: 78 },
    { fee: 31000, tickSpacing: 200 },
    { fee: 50000, tickSpacing: 500 },
  ],
  MRVL: [{ fee: 45000, tickSpacing: 450 }],
  MSFT: [
    { fee: 3000, tickSpacing: 60 },
    { fee: 900, tickSpacing: 9 },
    { fee: 10000, tickSpacing: 200 },
  ],
  MSTR: [
    { fee: 2400, tickSpacing: 24 },
    { fee: 2500, tickSpacing: 25 },
    { fee: 499, tickSpacing: 5 },
  ],
  MTSI: [{ fee: 50000, tickSpacing: 500 }],
  MU: [{ fee: 10000, tickSpacing: 200 }],
  MXL: [
    { fee: 48910, tickSpacing: 1 },
    { fee: 38500, tickSpacing: 385 },
  ],
  NAVN: [{ fee: 48730, tickSpacing: 1 }],
  NBIS: [
    { fee: 9900, tickSpacing: 99 },
    { fee: 50000, tickSpacing: 500 },
    { fee: 38500, tickSpacing: 385 },
  ],
  NET: [
    { fee: 9500, tickSpacing: 95 },
    { fee: 40000, tickSpacing: 400 },
    { fee: 5000, tickSpacing: 50 },
  ],
  NFLX: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 1500, tickSpacing: 15 },
    { fee: 49650, tickSpacing: 497 },
  ],
  NNE: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 19900, tickSpacing: 199 },
    { fee: 28000, tickSpacing: 280 },
  ],
  NOW: [{ fee: 50000, tickSpacing: 500 }],
  NU: [
    { fee: 8000, tickSpacing: 1 },
    { fee: 50000, tickSpacing: 500 },
  ],
  NVDA: [
    { fee: 100, tickSpacing: 1 },
    { fee: 3000, tickSpacing: 60 },
    { fee: 375, tickSpacing: 4 },
  ],
  NVTS: [
    { fee: 45000, tickSpacing: 450 },
    { fee: 49000, tickSpacing: 490 },
  ],
  OKLO: [
    { fee: 45000, tickSpacing: 450 },
    { fee: 50000, tickSpacing: 500 },
  ],
  ON: [
    { fee: 50000, tickSpacing: 500 },
    { fee: 29000, tickSpacing: 290 },
  ],
  ONTO: [{ fee: 48600, tickSpacing: 1 }],
  ORCL: [
    { fee: 10000, tickSpacing: 200 },
    { fee: 5000, tickSpacing: 50 },
  ],
  OUST: [
    { fee: 45000, tickSpacing: 450 },
    { fee: 50000, tickSpacing: 500 },
  ],
  P: [
    { fee: 19000, tickSpacing: 190 },
    { fee: 25200, tickSpacing: 252 },
    { fee: 30000, tickSpacing: 300 },
  ],
  PANW: [
    { fee: 49800, tickSpacing: 498 },
    { fee: 42000, tickSpacing: 420 },
  ],
  PATH: [
    { fee: 41000, tickSpacing: 410 },
    { fee: 47000, tickSpacing: 470 },
    { fee: 50000, tickSpacing: 500 },
  ],
  PENG: [
    { fee: 50000, tickSpacing: 500 },
    { fee: 20000, tickSpacing: 200 },
    { fee: 35000, tickSpacing: 350 },
  ],
  PFE: [
    { fee: 1500, tickSpacing: 15 },
    { fee: 8000, tickSpacing: 80 },
    { fee: 1000, tickSpacing: 10 },
  ],
  PL: [
    { fee: 50000, tickSpacing: 500 },
    { fee: 2510, tickSpacing: 25 },
  ],
  PLTR: [
    { fee: 10000, tickSpacing: 200 },
    { fee: 1500, tickSpacing: 15 },
    { fee: 11100, tickSpacing: 111 },
  ],
  POET: [
    { fee: 25000, tickSpacing: 250 },
    { fee: 50000, tickSpacing: 500 },
  ],
  POWL: [
    { fee: 49080, tickSpacing: 1 },
    { fee: 50000, tickSpacing: 500 },
  ],
  PR: [
    { fee: 47500, tickSpacing: 475 },
    { fee: 50000, tickSpacing: 500 },
  ],
  PWR: [{ fee: 48000, tickSpacing: 480 }],
  QBTS: [
    { fee: 42600, tickSpacing: 426 },
    { fee: 45000, tickSpacing: 450 },
  ],
  QCOM: [
    { fee: 3500, tickSpacing: 71 },
    { fee: 22350, tickSpacing: 224 },
    { fee: 50000, tickSpacing: 500 },
  ],
  QQQ: [
    { fee: 50000, tickSpacing: 500 },
    { fee: 3000, tickSpacing: 60 },
    { fee: 10000, tickSpacing: 200 },
  ],
  QUBT: [
    { fee: 50000, tickSpacing: 500 },
    { fee: 5100, tickSpacing: 51 },
    { fee: 49900, tickSpacing: 499 },
  ],
  RBLX: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 1000, tickSpacing: 10 },
    { fee: 50000, tickSpacing: 500 },
  ],
  RCAT: [
    { fee: 2500, tickSpacing: 25 },
    { fee: 9000, tickSpacing: 90 },
    { fee: 6000, tickSpacing: 60 },
  ],
  RDDT: [
    { fee: 2900, tickSpacing: 29 },
    { fee: 10000, tickSpacing: 200 },
    { fee: 50000, tickSpacing: 1000 },
  ],
  RDW: [
    { fee: 48930, tickSpacing: 1 },
    { fee: 49000, tickSpacing: 490 },
  ],
  RGTI: [{ fee: 50000, tickSpacing: 500 }],
  RIVN: [
    { fee: 2300, tickSpacing: 23 },
    { fee: 3520, tickSpacing: 35 },
    { fee: 45000, tickSpacing: 450 },
  ],
  RKLB: [{ fee: 9000, tickSpacing: 90 }],
  RUN: [
    { fee: 6000, tickSpacing: 60 },
    { fee: 41000, tickSpacing: 410 },
    { fee: 44000, tickSpacing: 440 },
  ],
  SCHD: [
    { fee: 49000, tickSpacing: 490 },
    { fee: 50000, tickSpacing: 500 },
  ],
  SGOV: [
    { fee: 375, tickSpacing: 4 },
    { fee: 200, tickSpacing: 2 },
    { fee: 2500, tickSpacing: 2 },
  ],
  SHOP: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 50000, tickSpacing: 500 },
    { fee: 5210, tickSpacing: 52 },
  ],
  SHY: [{ fee: 48380, tickSpacing: 1 }],
  SIMO: [{ fee: 50000, tickSpacing: 500 }],
  SKHY: [
    { fee: 8880, tickSpacing: 89 },
    { fee: 33000, tickSpacing: 330 },
  ],
  SLS: [{ fee: 50000, tickSpacing: 500 }],
  SLV: [
    { fee: 375, tickSpacing: 4 },
    { fee: 10000, tickSpacing: 200 },
    { fee: 20000, tickSpacing: 400 },
  ],
  SMCI: [{ fee: 48000, tickSpacing: 480 }],
  SMH: [{ fee: 50000, tickSpacing: 500 }],
  SMR: [
    { fee: 9000, tickSpacing: 90 },
    { fee: 10000, tickSpacing: 100 },
    { fee: 49700, tickSpacing: 497 },
  ],
  SNAP: [
    { fee: 1950, tickSpacing: 20 },
    { fee: 1100, tickSpacing: 11 },
    { fee: 2010, tickSpacing: 20 },
  ],
  SNDK: [
    { fee: 10000, tickSpacing: 200 },
    { fee: 4000, tickSpacing: 40 },
    { fee: 8000, tickSpacing: 80 },
  ],
  SNOW: [
    { fee: 10000, tickSpacing: 200 },
    { fee: 5100, tickSpacing: 51 },
    { fee: 50000, tickSpacing: 500 },
  ],
  SOFI: [
    { fee: 29578, tickSpacing: 296 },
    { fee: 30900, tickSpacing: 309 },
    { fee: 29465, tickSpacing: 295 },
  ],
  SOUN: [
    { fee: 2457, tickSpacing: 25 },
    { fee: 28950, tickSpacing: 290 },
    { fee: 40000, tickSpacing: 50 },
  ],
  SOXX: [
    { fee: 9000, tickSpacing: 90 },
    { fee: 50000, tickSpacing: 500 },
    { fee: 5000, tickSpacing: 50 },
  ],
  SPCX: [
    { fee: 10000, tickSpacing: 200 },
    { fee: 3000, tickSpacing: 60 },
    { fee: 2490, tickSpacing: 25 },
  ],
  SPMO: [{ fee: 50000, tickSpacing: 500 }],
  SPY: [
    { fee: 3000, tickSpacing: 60 },
    { fee: 500, tickSpacing: 5 },
  ],
  TE: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 50000, tickSpacing: 500 },
    { fee: 36000, tickSpacing: 360 },
  ],
  TEAM: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 27900, tickSpacing: 279 },
    { fee: 50000, tickSpacing: 500 },
  ],
  TEM: [
    { fee: 38500, tickSpacing: 385 },
    { fee: 50000, tickSpacing: 500 },
  ],
  TER: [
    { fee: 45000, tickSpacing: 450 },
    { fee: 50000, tickSpacing: 500 },
  ],
  TSEM: [
    { fee: 40000, tickSpacing: 260 },
    { fee: 49000, tickSpacing: 490 },
  ],
  TSLA: [
    { fee: 3000, tickSpacing: 60 },
    { fee: 2950, tickSpacing: 30 },
    { fee: 50000, tickSpacing: 1000 },
  ],
  TSM: [
    { fee: 7500, tickSpacing: 75 },
    { fee: 4000, tickSpacing: 40 },
    { fee: 9000, tickSpacing: 90 },
  ],
  TTD: [
    { fee: 2510, tickSpacing: 25 },
    { fee: 35000, tickSpacing: 350 },
    { fee: 47700, tickSpacing: 477 },
  ],
  TTWO: [
    { fee: 8000, tickSpacing: 80 },
    { fee: 2000, tickSpacing: 2 },
    { fee: 7800, tickSpacing: 78 },
  ],
  UMC: [{ fee: 50000, tickSpacing: 500 }],
  UNH: [
    { fee: 8000, tickSpacing: 80 },
    { fee: 40000, tickSpacing: 400 },
    { fee: 50000, tickSpacing: 500 },
  ],
  UPS: [
    { fee: 2400, tickSpacing: 24 },
    { fee: 35000, tickSpacing: 350 },
    { fee: 50000, tickSpacing: 500 },
  ],
  USAR: [{ fee: 2500, tickSpacing: 25 }],
  USO: [
    { fee: 1200, tickSpacing: 15 },
    { fee: 2500, tickSpacing: 25 },
  ],
  VICR: [{ fee: 50000, tickSpacing: 500 }],
  VRT: [
    { fee: 28000, tickSpacing: 280 },
    { fee: 29845, tickSpacing: 298 },
    { fee: 50000, tickSpacing: 500 },
  ],
  VSAT: [
    { fee: 50000, tickSpacing: 500 },
    { fee: 10000, tickSpacing: 100 },
    { fee: 46520, tickSpacing: 465 },
  ],
  VST: [
    { fee: 39000, tickSpacing: 390 },
    { fee: 50000, tickSpacing: 500 },
  ],
  WDAY: [
    { fee: 20000, tickSpacing: 200 },
    { fee: 19870, tickSpacing: 199 },
    { fee: 5000, tickSpacing: 50 },
  ],
  WDC: [
    { fee: 10000, tickSpacing: 100 },
    { fee: 50000, tickSpacing: 500 },
  ],
  WULF: [{ fee: 8000, tickSpacing: 80 }],
  WYFI: [
    { fee: 11100, tickSpacing: 111 },
    { fee: 12177, tickSpacing: 122 },
    { fee: 9900, tickSpacing: 99 },
  ],
  XLK: [
    { fee: 30000, tickSpacing: 300 },
    { fee: 50000, tickSpacing: 500 },
  ],
  XNDU: [{ fee: 50000, tickSpacing: 500 }],
  XOM: [
    { fee: 2000, tickSpacing: 20 },
    { fee: 50000, tickSpacing: 500 },
    { fee: 38000, tickSpacing: 380 },
  ],
  ZM: [
    { fee: 30000, tickSpacing: 300 },
    { fee: 10000, tickSpacing: 100 },
    { fee: 50000, tickSpacing: 500 },
  ],
  ZS: [
    { fee: 2500, tickSpacing: 25 },
    { fee: 38500, tickSpacing: 385 },
  ],
}
