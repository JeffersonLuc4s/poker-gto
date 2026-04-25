import React, { useState, useMemo, useEffect } from 'react';
import { Layers, Target, AlertCircle, Info, ChevronRight } from 'lucide-react';

// =============================================================
// CONFIGURAÇÕES BÁSICAS DE POKER
// =============================================================

const RANKS = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

const POSITIONS_6MAX = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
const POSITIONS_9MAX = ['UTG', 'UTG+1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

// =============================================================
// PARSER DE RANGES (notação padrão de poker)
// "22+, ATs+, KJs+, AJo+, KQo" -> Set de mãos
// =============================================================

function rankIdx(r) {
  return RANKS.indexOf(r);
}

function expandPart(part, hands) {
  part = part.trim();
  if (!part) return;

  if (part.endsWith('+')) {
    const base = part.slice(0, -1);
    if (base.length === 2) {
      // par+ ex: 22+
      const startIdx = rankIdx(base[0]);
      for (let i = startIdx; i >= 0; i--) {
        hands.add(RANKS[i] + RANKS[i]);
      }
    } else if (base.length === 3) {
      // suited/offsuit+ ex: ATs+, AJo+
      const high = base[0];
      const lowIdx = rankIdx(base[1]);
      const highIdx = rankIdx(high);
      const suit = base[2];
      for (let i = lowIdx; i > highIdx; i--) {
        hands.add(high + RANKS[i] + suit);
      }
    }
  } else if (part.includes('-')) {
    // range ex: T8s-T6s ou TT-88
    const [from, to] = part.split('-').map((s) => s.trim());
    if (from.length === 2 && to.length === 2) {
      const a = rankIdx(from[0]);
      const b = rankIdx(to[0]);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
        hands.add(RANKS[i] + RANKS[i]);
      }
    } else if (from.length === 3 && to.length === 3) {
      const high = from[0];
      const suit = from[2];
      const a = rankIdx(from[1]);
      const b = rankIdx(to[1]);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
        hands.add(high + RANKS[i] + suit);
      }
    }
  } else {
    // mão exata
    hands.add(part);
  }
}

function parseRange(rangeStr) {
  const hands = new Set();
  if (!rangeStr) return hands;
  rangeStr.split(',').forEach((p) => expandPart(p, hands));
  return hands;
}

// =============================================================
// BASE DE DADOS DE CENÁRIOS GTO (APROXIMAÇÕES)
// Baseado em ranges GTO publicamente conhecidos para 100bb cash.
// Estrutura: cada cenário tem ranges puros (raise/call) e mãos
// com estratégia mista (frequências específicas).
// =============================================================

const SCENARIOS = {
  // ---------- 6-MAX RFI (Raise First In) ----------
  '6max_100bb_UTG_RFI': {
    label: 'UTG abre (ninguém entrou)',
    type: 'rfi',
    raise: '22+, A8s+, A5s, A4s, KTs+, QTs+, JTs, T9s, 98s, 87s, 76s, 65s, AJo+, KQo',
    mixed: {
      A7s: { raise: 50, fold: 50 },
      A3s: { raise: 50, fold: 50 },
      A2s: { raise: 50, fold: 50 },
      K9s: { raise: 70, fold: 30 },
      ATo: { raise: 80, fold: 20 },
      KJo: { raise: 60, fold: 40 },
    },
  },
  '6max_100bb_HJ_RFI': {
    label: 'HJ abre',
    type: 'rfi',
    raise: '22+, A2s+, KTs+, QTs+, J9s+, T9s, 98s, 87s, 76s, 65s, ATo+, KJo+, QJo',
    mixed: {
      K9s: { raise: 80, fold: 20 },
      Q9s: { raise: 80, fold: 20 },
      J9s: { raise: 80, fold: 20 },
      '54s': { raise: 60, fold: 40 },
      KTo: { raise: 70, fold: 30 },
      QJo: { raise: 70, fold: 30 },
    },
  },
  '6max_100bb_CO_RFI': {
    label: 'CO abre',
    type: 'rfi',
    raise: '22+, A2s+, K7s+, Q9s+, J8s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A9o+, KTo+, QTo+, JTo',
    mixed: {
      K6s: { raise: 50, fold: 50 },
      Q8s: { raise: 70, fold: 30 },
      J7s: { raise: 50, fold: 50 },
      T7s: { raise: 60, fold: 40 },
      '96s': { raise: 60, fold: 40 },
      '85s': { raise: 60, fold: 40 },
      '74s': { raise: 50, fold: 50 },
      A8o: { raise: 70, fold: 30 },
      K9o: { raise: 60, fold: 40 },
      Q9o: { raise: 50, fold: 50 },
    },
  },
  '6max_100bb_BTN_RFI': {
    label: 'BTN abre',
    type: 'rfi',
    raise: '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 85s+, 75s+, 64s+, 53s+, 43s, A2o+, K8o+, Q9o+, J9o+, T9o, 98o',
    mixed: {
      Q4s: { raise: 60, fold: 40 },
      J6s: { raise: 60, fold: 40 },
      T6s: { raise: 50, fold: 50 },
      '95s': { raise: 60, fold: 40 },
      '84s': { raise: 50, fold: 50 },
      '73s': { raise: 40, fold: 60 },
      '63s': { raise: 50, fold: 50 },
      '52s': { raise: 40, fold: 60 },
      '42s': { raise: 30, fold: 70 },
      '32s': { raise: 30, fold: 70 },
      K7o: { raise: 60, fold: 40 },
      Q8o: { raise: 60, fold: 40 },
      J8o: { raise: 60, fold: 40 },
      T8o: { raise: 60, fold: 40 },
      '97o': { raise: 50, fold: 50 },
      '87o': { raise: 50, fold: 50 },
      '76o': { raise: 40, fold: 60 },
    },
  },
  '6max_100bb_SB_RFI': {
    label: 'SB abre (todo mundo deu fold)',
    type: 'rfi',
    raise: '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A7o+, KTo+, QTo+, JTo',
    mixed: {
      K5s: { raise: 60, fold: 40 },
      K4s: { raise: 50, fold: 50 },
      Q7s: { raise: 60, fold: 40 },
      J7s: { raise: 60, fold: 40 },
      T7s: { raise: 60, fold: 40 },
      '96s': { raise: 60, fold: 40 },
      '85s': { raise: 50, fold: 50 },
      '74s': { raise: 40, fold: 60 },
      '64s': { raise: 50, fold: 50 },
      '53s': { raise: 50, fold: 50 },
      '43s': { raise: 40, fold: 60 },
      A6o: { raise: 60, fold: 40 },
      A5o: { raise: 70, fold: 30 },
      A4o: { raise: 60, fold: 40 },
      A3o: { raise: 50, fold: 50 },
      A2o: { raise: 40, fold: 60 },
      K9o: { raise: 70, fold: 30 },
      Q9o: { raise: 60, fold: 40 },
      J9o: { raise: 50, fold: 50 },
    },
  },

  // ---------- BB defendendo vs RFI ----------
  '6max_100bb_BB_vs_UTG_open': {
    label: 'BB defende vs UTG open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s', // 3-bet range
    call: 'TT-22, AQs-A6s, A3s-A2s, KTs+, QTs+, JTs, T9s, 98s, 87s, 76s, AQo, KQo',
    mixed: {
      JJ: { raise: 60, call: 40, fold: 0 },
      AJs: { raise: 40, call: 60, fold: 0 },
      KQs: { raise: 30, call: 70, fold: 0 },
      AJo: { raise: 30, call: 70, fold: 0 },
    },
  },
  '6max_100bb_BB_vs_CO_open': {
    label: 'BB defende vs CO open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s, KQs',
    call:
      'JJ-22, AJs-A6s, A3s-A2s, K9s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, AJo, ATo, KJo, QJo, JTo',
    mixed: {
      AQo: { raise: 50, call: 50, fold: 0 },
      KJs: { raise: 30, call: 70, fold: 0 },
      A5o: { raise: 30, call: 30, fold: 40 },
      KTo: { raise: 0, call: 70, fold: 30 },
    },
  },
  '6max_100bb_BB_vs_BTN_open': {
    label: 'BB defende vs BTN open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, A5s, A4s, KQs, KJs',
    call:
      'JJ-22, AQo-A2o, ATs-A6s, A3s-A2s, K2s+, Q6s+, J7s+, T7s+, 96s+, 85s+, 74s+, 63s+, 53s+, 43s, KTo+, QTo+, JTo, T9o, 98o',
    mixed: {
      KTs: { raise: 30, call: 70, fold: 0 },
      QTs: { raise: 20, call: 80, fold: 0 },
      AJo: { raise: 40, call: 60, fold: 0 },
      ATo: { raise: 20, call: 80, fold: 0 },
    },
  },
  '6max_100bb_BB_vs_SB_open': {
    label: 'BB defende vs SB open',
    type: 'facing',
    raise: 'TT+, AKs, AKo, AQs, AQo, AJs, A5s, A4s, KQs',
    call:
      '99-22, AJo-A2o, AJs-A2s, K2s+, Q4s+, J6s+, T7s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, KTo+, QTo+, J9o+, T9o, 98o, 87o, 76o',
    mixed: {
      KJs: { raise: 50, call: 50, fold: 0 },
      QJs: { raise: 30, call: 70, fold: 0 },
    },
  },
  '6max_100bb_BB_vs_HJ_open': {
    label: 'BB defende vs HJ open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s, KQs',
    call:
      'JJ-22, AQs-A6s, A3s-A2s, KTs+, QTs+, J9s+, T9s, 98s, 87s, 76s, 65s, AQo, AJo, KQo, KJo',
    mixed: {
      AJs: { raise: 40, call: 60, fold: 0 },
      KJs: { raise: 30, call: 70, fold: 0 },
      QJs: { raise: 20, call: 80, fold: 0 },
      ATo: { raise: 0, call: 70, fold: 30 },
    },
  },

  // ---------- 6-MAX facing non-BB (3-bet spots) ----------
  '6max_100bb_HJ_vs_UTG_open': {
    label: 'HJ vs UTG open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s',
    call: 'JJ-77, AQs-AJs, KQs, AQo',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      ATs: { raise: 30, call: 40, fold: 30 },
      KJs: { raise: 20, call: 50, fold: 30 },
      '66': { raise: 0, call: 60, fold: 40 },
      '55': { raise: 0, call: 50, fold: 50 },
    },
  },
  '6max_100bb_CO_vs_UTG_open': {
    label: 'CO vs UTG open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s',
    call: 'JJ-77, AQs-AJs, KQs, KJs, QJs, JTs, T9s, AQo',
    mixed: {
      TT: { raise: 60, call: 40, fold: 0 },
      ATs: { raise: 20, call: 60, fold: 20 },
      '66': { raise: 0, call: 70, fold: 30 },
      '98s': { raise: 0, call: 50, fold: 50 },
    },
  },
  '6max_100bb_CO_vs_HJ_open': {
    label: 'CO vs HJ open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AJs, KQs, A5s, A4s',
    call: 'JJ-66, AQs, ATs, KJs, QJs, JTs, T9s, 98s, 87s, AQo, KQo',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      A9s: { raise: 30, call: 50, fold: 20 },
      KTs: { raise: 20, call: 60, fold: 20 },
      '55': { raise: 0, call: 60, fold: 40 },
      AJo: { raise: 0, call: 60, fold: 40 },
    },
  },
  '6max_100bb_BTN_vs_UTG_open': {
    label: 'BTN vs UTG open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AJs, A5s, A4s',
    call: 'JJ-66, AQs, ATs, KQs, KJs, QJs, JTs, T9s, 98s, 87s, AQo, KQo',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      '55': { raise: 0, call: 70, fold: 30 },
      '76s': { raise: 0, call: 50, fold: 50 },
      AJo: { raise: 20, call: 60, fold: 20 },
    },
  },
  '6max_100bb_BTN_vs_HJ_open': {
    label: 'BTN vs HJ open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, A5s, A4s, KQs',
    call:
      'JJ-55, AQo, ATs-A8s, KJs, KTs, QJs, QTs, JTs, T9s, 98s, 87s, 76s, 65s, AJo, KJo, QJo',
    mixed: {
      TT: { raise: 60, call: 40, fold: 0 },
      '44': { raise: 0, call: 60, fold: 40 },
      '33': { raise: 0, call: 50, fold: 50 },
      KJs: { raise: 30, call: 70, fold: 0 },
      ATo: { raise: 0, call: 60, fold: 40 },
    },
  },
  '6max_100bb_BTN_vs_CO_open': {
    label: 'BTN vs CO open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, KQs, KJs, A5s, A4s',
    call:
      'JJ-22, AQo, ATs-A6s, K9s, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, AJo, ATo, KJo, KTo, QJo, QTo, JTo',
    mixed: {
      TT: { raise: 60, call: 40, fold: 0 },
      A5s: { raise: 80, call: 20, fold: 0 },
      KTs: { raise: 30, call: 70, fold: 0 },
      QTs: { raise: 20, call: 80, fold: 0 },
    },
  },
  '6max_100bb_SB_vs_UTG_open': {
    label: 'SB vs UTG open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s',
    call: 'JJ-99, AJs, KQs',
    mixed: {
      TT: { raise: 70, call: 30, fold: 0 },
      '88': { raise: 0, call: 60, fold: 40 },
      '77': { raise: 0, call: 50, fold: 50 },
      AQo: { raise: 60, call: 0, fold: 40 },
    },
  },
  '6max_100bb_SB_vs_HJ_open': {
    label: 'SB vs HJ open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, KQs, A5s, A4s',
    call: 'JJ-88, ATs, KJs, QJs',
    mixed: {
      TT: { raise: 70, call: 30, fold: 0 },
      '77': { raise: 0, call: 50, fold: 50 },
      AQo: { raise: 70, call: 0, fold: 30 },
    },
  },
  '6max_100bb_SB_vs_CO_open': {
    label: 'SB vs CO open',
    type: 'facing',
    raise: 'TT+, AKs, AKo, AQs, AQo, AJs, KQs, KJs, A5s, A4s, A3s',
    call: '99-77, ATs-A8s, KTs, QJs, QTs, JTs, T9s',
    mixed: {
      '66': { raise: 0, call: 50, fold: 50 },
      '55': { raise: 0, call: 40, fold: 60 },
      AJo: { raise: 60, call: 0, fold: 40 },
    },
  },
  '6max_100bb_SB_vs_BTN_open': {
    label: 'SB vs BTN open',
    type: 'facing',
    raise:
      'TT+, AKs, AKo, AQs, AQo, AJs, ATs, KQs, KJs, KTs, QJs, A5s, A4s, A3s, A2s',
    call: '99-55, A9s-A6s, K9s, Q9s+, J9s, T9s, 98s, AJo, KQo',
    mixed: {
      '44': { raise: 0, call: 60, fold: 40 },
      '33': { raise: 0, call: 50, fold: 50 },
      '22': { raise: 0, call: 40, fold: 60 },
      ATo: { raise: 40, call: 20, fold: 40 },
    },
  },

  // ---------- 9-MAX RFI (versão simplificada) ----------
  '9max_100bb_UTG_RFI': {
    label: 'UTG abre (mesa de 9)',
    type: 'rfi',
    raise: '77+, ATs+, KTs+, QTs+, JTs, T9s, AQo+, KQo',
    mixed: {
      '66': { raise: 60, fold: 40 },
      '55': { raise: 50, fold: 50 },
      '98s': { raise: 50, fold: 50 },
      AJo: { raise: 70, fold: 30 },
    },
  },
  '9max_100bb_UTG+1_RFI': {
    label: 'UTG+1 abre',
    type: 'rfi',
    raise: '66+, A9s+, KTs+, QTs+, JTs, T9s, AJo+, KQo',
    mixed: {
      '55': { raise: 60, fold: 40 },
      '44': { raise: 40, fold: 60 },
      A8s: { raise: 60, fold: 40 },
      '98s': { raise: 50, fold: 50 },
      KJo: { raise: 50, fold: 50 },
    },
  },
  '9max_100bb_MP_RFI': {
    label: 'MP abre',
    type: 'rfi',
    raise: '55+, A9s+, KTs+, QTs+, JTs, T9s, 98s, AJo+, KQo',
    mixed: {
      '44': { raise: 60, fold: 40 },
      '33': { raise: 50, fold: 50 },
      '22': { raise: 40, fold: 60 },
      A8s: { raise: 60, fold: 40 },
      '87s': { raise: 50, fold: 50 },
    },
  },
  '9max_100bb_LJ_RFI': {
    label: 'LJ abre',
    type: 'rfi',
    raise: '33+, A7s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, ATo+, KJo+',
    mixed: {
      '22': { raise: 60, fold: 40 },
      A6s: { raise: 60, fold: 40 },
      A5s: { raise: 80, fold: 20 },
      K8s: { raise: 50, fold: 50 },
      '76s': { raise: 50, fold: 50 },
      QJo: { raise: 60, fold: 40 },
    },
  },
  '9max_100bb_HJ_RFI': {
    label: 'HJ abre',
    type: 'rfi',
    raise: '22+, A5s+, K9s+, Q9s+, J9s+, T8s+, 98s, 87s, 76s, ATo+, KJo+, QJo',
    mixed: {
      A4s: { raise: 70, fold: 30 },
      A3s: { raise: 60, fold: 40 },
      A2s: { raise: 50, fold: 50 },
      K8s: { raise: 60, fold: 40 },
      Q8s: { raise: 50, fold: 50 },
      J8s: { raise: 50, fold: 50 },
      '65s': { raise: 60, fold: 40 },
      '54s': { raise: 50, fold: 50 },
      KTo: { raise: 70, fold: 30 },
      QTo: { raise: 50, fold: 50 },
      JTo: { raise: 60, fold: 40 },
    },
  },
  '9max_100bb_CO_RFI': {
    label: 'CO abre',
    type: 'rfi',
    raise:
      '22+, A2s+, K7s+, Q9s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A9o+, KTo+, QTo+, JTo',
    mixed: {
      K6s: { raise: 60, fold: 40 },
      Q8s: { raise: 70, fold: 30 },
      J7s: { raise: 50, fold: 50 },
      T7s: { raise: 60, fold: 40 },
      '86s': { raise: 60, fold: 40 },
      '75s': { raise: 70, fold: 30 },
      '54s': { raise: 60, fold: 40 },
      A8o: { raise: 70, fold: 30 },
      K9o: { raise: 60, fold: 40 },
      Q9o: { raise: 50, fold: 50 },
      J9o: { raise: 50, fold: 50 },
    },
  },
  '9max_100bb_BTN_RFI': {
    label: 'BTN abre',
    type: 'rfi',
    raise:
      '22+, A2s+, K2s+, Q6s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 53s+, 43s, A2o+, K8o+, Q9o+, J9o+, T9o, 98o',
    mixed: {
      Q5s: { raise: 50, fold: 50 },
      J6s: { raise: 60, fold: 40 },
      T6s: { raise: 50, fold: 50 },
      '95s': { raise: 60, fold: 40 },
      '85s': { raise: 60, fold: 40 },
      '74s': { raise: 50, fold: 50 },
      '63s': { raise: 40, fold: 60 },
      '52s': { raise: 40, fold: 60 },
      '42s': { raise: 30, fold: 70 },
      '32s': { raise: 30, fold: 70 },
      K7o: { raise: 60, fold: 40 },
      Q8o: { raise: 60, fold: 40 },
      J8o: { raise: 60, fold: 40 },
      T8o: { raise: 60, fold: 40 },
      '97o': { raise: 50, fold: 50 },
      '87o': { raise: 50, fold: 50 },
      '76o': { raise: 40, fold: 60 },
    },
  },
  '9max_100bb_SB_RFI': {
    label: 'SB abre (todo mundo deu fold)',
    type: 'rfi',
    raise:
      '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A7o+, KTo+, QTo+, JTo',
    mixed: {
      K5s: { raise: 60, fold: 40 },
      K4s: { raise: 50, fold: 50 },
      Q7s: { raise: 60, fold: 40 },
      J7s: { raise: 60, fold: 40 },
      T7s: { raise: 60, fold: 40 },
      '96s': { raise: 60, fold: 40 },
      '85s': { raise: 50, fold: 50 },
      '74s': { raise: 40, fold: 60 },
      '64s': { raise: 50, fold: 50 },
      '53s': { raise: 50, fold: 50 },
      '43s': { raise: 40, fold: 60 },
      A6o: { raise: 60, fold: 40 },
      A5o: { raise: 70, fold: 30 },
      A4o: { raise: 60, fold: 40 },
      A3o: { raise: 50, fold: 50 },
      A2o: { raise: 40, fold: 60 },
      K9o: { raise: 70, fold: 30 },
      Q9o: { raise: 60, fold: 40 },
      J9o: { raise: 50, fold: 50 },
    },
  },

  // ---------- 9-MAX BB defenses ----------
  '9max_100bb_BB_vs_UTG_open': {
    label: 'BB defende vs UTG open (mesa de 9)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s',
    call: 'TT-22, AQs-A9s, KTs+, QTs+, JTs, T9s, 98s, 87s, AQo, KQo',
    mixed: {
      JJ: { raise: 50, call: 50, fold: 0 },
      AJs: { raise: 30, call: 70, fold: 0 },
      KQs: { raise: 20, call: 80, fold: 0 },
    },
  },
  '9max_100bb_BB_vs_UTG+1_open': {
    label: 'BB defende vs UTG+1 open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s',
    call: 'TT-22, AQs-A9s, KTs+, QTs+, JTs, T9s, 98s, 87s, 76s, AQo, KQo',
    mixed: {
      JJ: { raise: 60, call: 40, fold: 0 },
      AJs: { raise: 40, call: 60, fold: 0 },
      KQs: { raise: 20, call: 80, fold: 0 },
      AJo: { raise: 20, call: 80, fold: 0 },
    },
  },
  '9max_100bb_BB_vs_MP_open': {
    label: 'BB defende vs MP open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s, KQs',
    call: 'JJ-22, AQs-A8s, A3s-A2s, KTs+, QTs+, JTs, T9s, 98s, 87s, 76s, AQo, AJo, KQo',
    mixed: {
      AJs: { raise: 40, call: 60, fold: 0 },
      KJs: { raise: 20, call: 80, fold: 0 },
      ATs: { raise: 20, call: 80, fold: 0 },
    },
  },
  '9max_100bb_BB_vs_LJ_open': {
    label: 'BB defende vs LJ open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s, KQs',
    call:
      'JJ-22, AJs-A6s, A3s-A2s, KTs+, Q9s+, J9s+, T9s, 98s, 87s, 76s, 65s, AQo, AJo, KQo, KJo',
    mixed: {
      AJs: { raise: 30, call: 70, fold: 0 },
      KJs: { raise: 20, call: 80, fold: 0 },
      QJs: { raise: 20, call: 80, fold: 0 },
    },
  },
  '9max_100bb_BB_vs_HJ_open': {
    label: 'BB defende vs HJ open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s, KQs',
    call:
      'JJ-22, AJs-A6s, A3s-A2s, KTs+, Q9s+, J9s+, T9s, 98s, 87s, 76s, 65s, AJo, ATo, KJo, QJo',
    mixed: {
      AJs: { raise: 30, call: 70, fold: 0 },
      KJs: { raise: 20, call: 80, fold: 0 },
      ATo: { raise: 0, call: 70, fold: 30 },
    },
  },
  '9max_100bb_BB_vs_CO_open': {
    label: 'BB defende vs CO open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s, KQs',
    call:
      'JJ-22, AJs-A6s, A3s-A2s, K9s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, AJo, ATo, KJo, QJo, JTo',
    mixed: {
      AQo: { raise: 50, call: 50, fold: 0 },
      KJs: { raise: 30, call: 70, fold: 0 },
      A5o: { raise: 30, call: 30, fold: 40 },
      KTo: { raise: 0, call: 70, fold: 30 },
    },
  },
  '9max_100bb_BB_vs_BTN_open': {
    label: 'BB defende vs BTN open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, A5s, A4s, KQs, KJs',
    call:
      'JJ-22, AQo-A2o, ATs-A6s, A3s-A2s, K2s+, Q6s+, J7s+, T7s+, 96s+, 85s+, 74s+, 63s+, 53s+, 43s, KTo+, QTo+, JTo, T9o, 98o',
    mixed: {
      KTs: { raise: 30, call: 70, fold: 0 },
      QTs: { raise: 20, call: 80, fold: 0 },
      AJo: { raise: 40, call: 60, fold: 0 },
      ATo: { raise: 20, call: 80, fold: 0 },
    },
  },
  '9max_100bb_BB_vs_SB_open': {
    label: 'BB defende vs SB open',
    type: 'facing',
    raise: 'TT+, AKs, AKo, AQs, AQo, AJs, A5s, A4s, KQs',
    call:
      '99-22, AJo-A2o, AJs-A2s, K2s+, Q4s+, J6s+, T7s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, KTo+, QTo+, J9o+, T9o, 98o, 87o, 76o',
    mixed: {
      KJs: { raise: 50, call: 50, fold: 0 },
      QJs: { raise: 30, call: 70, fold: 0 },
    },
  },

  // ---------- 9-MAX non-BB facing (3-bet spots) ----------
  '9max_100bb_UTG+1_vs_UTG_open': {
    label: 'UTG+1 vs UTG open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo',
    call: 'JJ-99, AQs, KQs',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      '88': { raise: 0, call: 50, fold: 50 },
      AJs: { raise: 20, call: 40, fold: 40 },
    },
  },
  '9max_100bb_MP_vs_UTG_open': {
    label: 'MP vs UTG open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s',
    call: 'JJ-88, AQs, AJs, KQs',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      '77': { raise: 0, call: 50, fold: 50 },
    },
  },
  '9max_100bb_MP_vs_UTG+1_open': {
    label: 'MP vs UTG+1 open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s',
    call: 'JJ-88, AQs, AJs, KQs, QJs',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      '77': { raise: 0, call: 40, fold: 60 },
    },
  },
  '9max_100bb_LJ_vs_UTG_open': {
    label: 'LJ vs UTG open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s',
    call: 'JJ-88, AQs, AJs, KQs',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      '77': { raise: 0, call: 50, fold: 50 },
    },
  },
  '9max_100bb_LJ_vs_UTG+1_open': {
    label: 'LJ vs UTG+1 open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s',
    call: 'JJ-77, AQs, AJs, KQs, QJs, JTs',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      '66': { raise: 0, call: 40, fold: 60 },
    },
  },
  '9max_100bb_LJ_vs_MP_open': {
    label: 'LJ vs MP open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s',
    call: 'JJ-66, AQs-AJs, KQs, KJs, QJs, JTs, T9s, AQo',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      ATs: { raise: 20, call: 60, fold: 20 },
    },
  },
  '9max_100bb_HJ_vs_UTG_open': {
    label: 'HJ vs UTG open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s',
    call: 'JJ-88, AQs, AJs, KQs',
    mixed: {
      TT: { raise: 40, call: 60, fold: 0 },
      '77': { raise: 0, call: 50, fold: 50 },
    },
  },
  '9max_100bb_HJ_vs_UTG+1_open': {
    label: 'HJ vs UTG+1 open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s',
    call: 'JJ-77, AQs-AJs, KQs, QJs, JTs',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      '66': { raise: 0, call: 40, fold: 60 },
    },
  },
  '9max_100bb_HJ_vs_MP_open': {
    label: 'HJ vs MP open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AJs, A5s, A4s',
    call: 'JJ-66, AQs, ATs-A9s, KQs, KJs, QJs, JTs, T9s, 98s, AQo',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      A5s: { raise: 80, call: 20, fold: 0 },
    },
  },
  '9max_100bb_HJ_vs_LJ_open': {
    label: 'HJ vs LJ open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AJs, KQs, A5s, A4s',
    call: 'JJ-55, AQs, ATs-A9s, KJs-KTs, QJs-QTs, JTs, T9s, 98s, AQo, KQo',
    mixed: {
      TT: { raise: 40, call: 60, fold: 0 },
      A4s: { raise: 70, call: 30, fold: 0 },
    },
  },
  '9max_100bb_CO_vs_UTG_open': {
    label: 'CO vs UTG open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s',
    call: 'JJ-77, AQs, AJs, KQs, KJs, QJs',
    mixed: {
      TT: { raise: 40, call: 60, fold: 0 },
      '66': { raise: 0, call: 50, fold: 50 },
    },
  },
  '9max_100bb_CO_vs_UTG+1_open': {
    label: 'CO vs UTG+1 open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s',
    call: 'JJ-66, AQs-ATs, KQs, KJs, QJs, JTs, T9s',
    mixed: {
      TT: { raise: 40, call: 60, fold: 0 },
    },
  },
  '9max_100bb_CO_vs_MP_open': {
    label: 'CO vs MP open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AJs, A5s, A4s, KQs',
    call: 'JJ-55, AQs, ATs-A9s, KJs-KTs, QJs-QTs, JTs, T9s, 98s, AQo',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
    },
  },
  '9max_100bb_CO_vs_LJ_open': {
    label: 'CO vs LJ open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AJs, KQs, A5s, A4s',
    call: 'JJ-22, AQs, ATs-A8s, KJs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, AQo, KQo',
    mixed: {
      TT: { raise: 40, call: 60, fold: 0 },
    },
  },
  '9max_100bb_CO_vs_HJ_open': {
    label: 'CO vs HJ open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AJs, KQs, A5s, A4s',
    call: 'JJ-22, AQs, ATs-A8s, KJs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, AQo, KQo',
    mixed: {
      TT: { raise: 40, call: 60, fold: 0 },
      KTs: { raise: 20, call: 60, fold: 20 },
    },
  },
  '9max_100bb_BTN_vs_UTG_open': {
    label: 'BTN vs UTG open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AJs, A5s, A4s',
    call: 'JJ-66, AQs, ATs-A9s, KQs, KJs, QJs, JTs, T9s, AQo',
    mixed: {
      TT: { raise: 40, call: 60, fold: 0 },
    },
  },
  '9max_100bb_BTN_vs_UTG+1_open': {
    label: 'BTN vs UTG+1 open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AJs, A5s, A4s',
    call: 'JJ-55, AQs, ATs-A9s, KQs, KJs, QJs, JTs, T9s, 98s, AQo',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
    },
  },
  '9max_100bb_BTN_vs_MP_open': {
    label: 'BTN vs MP open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, KQs, A5s, A4s',
    call: 'JJ-22, ATs-A9s, KJs-KTs, QJs-QTs, JTs, T9s, 98s, 87s, 76s, AQo, KQo',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      KJs: { raise: 30, call: 70, fold: 0 },
    },
  },
  '9max_100bb_BTN_vs_LJ_open': {
    label: 'BTN vs LJ open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, KQs, A5s, A4s',
    call: 'JJ-22, ATs-A8s, K9s, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s, AQo, KQo, KJo',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      KTs: { raise: 30, call: 70, fold: 0 },
    },
  },
  '9max_100bb_BTN_vs_HJ_open': {
    label: 'BTN vs HJ open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, KQs, A5s, A4s',
    call: 'JJ-22, ATs-A8s, K9s, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s, AJo+, KJo+, QJo',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      KJs: { raise: 30, call: 70, fold: 0 },
      ATo: { raise: 0, call: 70, fold: 30 },
    },
  },
  '9max_100bb_BTN_vs_CO_open': {
    label: 'BTN vs CO open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, KQs, KJs, A5s, A4s',
    call:
      'JJ-22, AQo, ATs-A6s, K9s, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, AJo, ATo, KJo, KTo, QJo, QTo, JTo',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      A5s: { raise: 80, call: 20, fold: 0 },
      KTs: { raise: 30, call: 70, fold: 0 },
    },
  },
  '9max_100bb_SB_vs_UTG_open': {
    label: 'SB vs UTG open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s',
    call: 'JJ-99, AJs, KQs',
    mixed: {
      TT: { raise: 60, call: 40, fold: 0 },
      '88': { raise: 0, call: 50, fold: 50 },
      AQo: { raise: 60, call: 0, fold: 40 },
    },
  },
  '9max_100bb_SB_vs_UTG+1_open': {
    label: 'SB vs UTG+1 open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s',
    call: 'JJ-88, AJs, KQs, QJs',
    mixed: {
      TT: { raise: 60, call: 40, fold: 0 },
      AQo: { raise: 60, call: 0, fold: 40 },
    },
  },
  '9max_100bb_SB_vs_MP_open': {
    label: 'SB vs MP open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, KQs, A5s, A4s',
    call: 'JJ-88, ATs, KJs, QJs, JTs',
    mixed: {
      TT: { raise: 60, call: 40, fold: 0 },
      '77': { raise: 0, call: 40, fold: 60 },
      AJo: { raise: 50, call: 0, fold: 50 },
    },
  },
  '9max_100bb_SB_vs_LJ_open': {
    label: 'SB vs LJ open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, KQs, A5s, A4s',
    call: 'JJ-77, ATs-A9s, KJs, KTs, QJs, JTs',
    mixed: {
      TT: { raise: 60, call: 40, fold: 0 },
      AJo: { raise: 50, call: 0, fold: 50 },
    },
  },
  '9max_100bb_SB_vs_HJ_open': {
    label: 'SB vs HJ open',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, KQs, A5s, A4s',
    call: 'JJ-77, ATs-A9s, KJs, KTs, QJs, JTs, T9s',
    mixed: {
      TT: { raise: 60, call: 40, fold: 0 },
      AJo: { raise: 50, call: 0, fold: 50 },
    },
  },
  '9max_100bb_SB_vs_CO_open': {
    label: 'SB vs CO open',
    type: 'facing',
    raise: 'TT+, AKs, AKo, AQs, AQo, AJs, KQs, KJs, A5s, A4s, A3s',
    call: '99-77, ATs-A8s, KTs, QJs, QTs, JTs, T9s',
    mixed: {
      '66': { raise: 0, call: 50, fold: 50 },
      AJo: { raise: 60, call: 0, fold: 40 },
    },
  },
  '9max_100bb_SB_vs_BTN_open': {
    label: 'SB vs BTN open',
    type: 'facing',
    raise:
      'TT+, AKs, AKo, AQs, AQo, AJs, ATs, KQs, KJs, KTs, QJs, A5s, A4s, A3s, A2s',
    call: '99-55, A9s-A6s, K9s, Q9s+, J9s, T9s, 98s, AJo, KQo',
    mixed: {
      '44': { raise: 0, call: 60, fold: 40 },
      '33': { raise: 0, call: 50, fold: 50 },
      ATo: { raise: 40, call: 20, fold: 40 },
    },
  },

  // =============================================================
  // 50BB — 6-MAX
  // =============================================================
  '6max_50bb_UTG_RFI': {
    label: 'UTG abre (50bb)',
    type: 'rfi',
    raise: '55+, ATs+, KTs+, QJs, JTs, T9s, 98s, AJo+, KQo',
    mixed: {
      '44': { raise: 60, fold: 40 },
      '33': { raise: 40, fold: 60 },
      A9s: { raise: 50, fold: 50 },
      KJo: { raise: 60, fold: 40 },
    },
  },
  '6max_50bb_HJ_RFI': {
    label: 'HJ abre (50bb)',
    type: 'rfi',
    raise: '44+, A9s+, KTs+, QTs+, J9s+, T9s, 98s, 87s, ATo+, KJo+, KQo',
    mixed: {
      '33': { raise: 50, fold: 50 },
      '22': { raise: 30, fold: 70 },
      A8s: { raise: 70, fold: 30 },
      '76s': { raise: 50, fold: 50 },
      QJo: { raise: 60, fold: 40 },
    },
  },
  '6max_50bb_CO_RFI': {
    label: 'CO abre (50bb)',
    type: 'rfi',
    raise: '22+, A7s+, K9s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s, A9o+, KTo+, QJo',
    mixed: {
      A6s: { raise: 60, fold: 40 },
      A5s: { raise: 80, fold: 20 },
      A4s: { raise: 70, fold: 30 },
      A3s: { raise: 60, fold: 40 },
      A2s: { raise: 50, fold: 50 },
      K8s: { raise: 60, fold: 40 },
      Q8s: { raise: 50, fold: 50 },
      '86s': { raise: 50, fold: 50 },
      '54s': { raise: 50, fold: 50 },
      KTo: { raise: 70, fold: 30 },
      QTo: { raise: 50, fold: 50 },
      JTo: { raise: 60, fold: 40 },
    },
  },
  '6max_50bb_BTN_RFI': {
    label: 'BTN abre (50bb)',
    type: 'rfi',
    raise: '22+, A2s+, K7s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A7o+, KTo+, QTo+, JTo',
    mixed: {
      K6s: { raise: 70, fold: 30 },
      K5s: { raise: 60, fold: 40 },
      Q7s: { raise: 60, fold: 40 },
      J7s: { raise: 60, fold: 40 },
      T7s: { raise: 50, fold: 50 },
      '96s': { raise: 50, fold: 50 },
      '85s': { raise: 50, fold: 50 },
      A6o: { raise: 60, fold: 40 },
      A5o: { raise: 70, fold: 30 },
      A4o: { raise: 50, fold: 50 },
      K9o: { raise: 70, fold: 30 },
      Q9o: { raise: 60, fold: 40 },
      J9o: { raise: 60, fold: 40 },
      T9o: { raise: 60, fold: 40 },
      '98o': { raise: 50, fold: 50 },
    },
  },
  '6max_50bb_SB_RFI': {
    label: 'SB abre (50bb)',
    type: 'rfi',
    raise: '22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, A7o+, KTo+, QJo',
    mixed: {
      K7s: { raise: 70, fold: 30 },
      K6s: { raise: 60, fold: 40 },
      Q8s: { raise: 70, fold: 30 },
      J8s: { raise: 70, fold: 30 },
      '96s': { raise: 60, fold: 40 },
      '85s': { raise: 50, fold: 50 },
      A6o: { raise: 70, fold: 30 },
      A5o: { raise: 80, fold: 20 },
      A4o: { raise: 60, fold: 40 },
      K9o: { raise: 70, fold: 30 },
      Q9o: { raise: 60, fold: 40 },
      QTo: { raise: 70, fold: 30 },
      JTo: { raise: 60, fold: 40 },
    },
  },
  '6max_50bb_BB_vs_UTG_open': {
    label: 'BB defende vs UTG (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s',
    call: 'JJ-22, AQs-A6s, KTs+, QTs+, JTs, T9s, 98s, AQo, KQo',
    mixed: {
      AJs: { raise: 40, call: 60, fold: 0 },
      KQs: { raise: 20, call: 80, fold: 0 },
      AJo: { raise: 20, call: 60, fold: 20 },
    },
  },
  '6max_50bb_BB_vs_HJ_open': {
    label: 'BB defende vs HJ (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s',
    call: 'JJ-22, AJs-A6s, KTs+, Q9s+, J9s+, T9s, 98s, 87s, AQo, AJo, KJo, QJo',
    mixed: {
      AJs: { raise: 30, call: 70, fold: 0 },
      KJs: { raise: 20, call: 80, fold: 0 },
      ATo: { raise: 0, call: 60, fold: 40 },
    },
  },
  '6max_50bb_BB_vs_CO_open': {
    label: 'BB defende vs CO (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s, KQs',
    call:
      'JJ-22, AJs-A6s, K9s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 76s, 65s, AJo, ATo, KJo, QJo, JTo',
    mixed: {
      AQo: { raise: 40, call: 60, fold: 0 },
      KJs: { raise: 20, call: 80, fold: 0 },
      A5o: { raise: 20, call: 40, fold: 40 },
    },
  },
  '6max_50bb_BB_vs_BTN_open': {
    label: 'BB defende vs BTN (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, A5s, A4s, KQs, KJs',
    call:
      'JJ-22, AQo-A2o, ATs-A6s, K2s+, Q7s+, J8s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, KTo+, QTo+, JTo, T9o, 98o',
    mixed: {
      KTs: { raise: 30, call: 70, fold: 0 },
      AJo: { raise: 30, call: 70, fold: 0 },
    },
  },
  '6max_50bb_BB_vs_SB_open': {
    label: 'BB defende vs SB (50bb)',
    type: 'facing',
    raise: 'TT+, AKs, AKo, AQs, AQo, AJs, A5s, A4s, KQs',
    call:
      '99-22, AJs-A2s, AJo-A2o, K2s+, Q4s+, J7s+, T7s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, KTo+, QTo+, J9o+, T9o, 98o, 87o, 76o',
    mixed: {
      KJs: { raise: 40, call: 60, fold: 0 },
      QJs: { raise: 20, call: 80, fold: 0 },
    },
  },

  // =============================================================
  // 20BB — 6-MAX (stack curto, ranges mais lineares)
  // =============================================================
  '6max_20bb_UTG_RFI': {
    label: 'UTG abre (20bb)',
    type: 'rfi',
    raise: '77+, ATs+, KJs+, QJs, JTs, AJo+, KQs',
    mixed: {
      '66': { raise: 60, fold: 40 },
      '55': { raise: 40, fold: 60 },
      ATo: { raise: 60, fold: 40 },
      KQo: { raise: 70, fold: 30 },
    },
  },
  '6max_20bb_HJ_RFI': {
    label: 'HJ abre (20bb)',
    type: 'rfi',
    raise: '66+, A9s+, KTs+, QTs+, JTs, T9s, ATo+, KJo+, KQs',
    mixed: {
      '55': { raise: 60, fold: 40 },
      '44': { raise: 40, fold: 60 },
      A8s: { raise: 60, fold: 40 },
      '98s': { raise: 50, fold: 50 },
      QJo: { raise: 60, fold: 40 },
    },
  },
  '6max_20bb_CO_RFI': {
    label: 'CO abre (20bb)',
    type: 'rfi',
    raise: '33+, A7s+, K9s+, QTs+, JTs, T9s, 98s, A9o+, KTo+, QJo',
    mixed: {
      '22': { raise: 50, fold: 50 },
      A6s: { raise: 60, fold: 40 },
      A5s: { raise: 80, fold: 20 },
      K8s: { raise: 50, fold: 50 },
      '87s': { raise: 50, fold: 50 },
      KJo: { raise: 70, fold: 30 },
    },
  },
  '6max_20bb_BTN_RFI': {
    label: 'BTN abre (20bb)',
    type: 'rfi',
    raise: '22+, A2s+, K7s+, Q9s+, J8s+, T8s+, 97s+, 87s, 76s, A7o+, KTo+, QTo+, JTo',
    mixed: {
      K6s: { raise: 60, fold: 40 },
      Q8s: { raise: 60, fold: 40 },
      J7s: { raise: 50, fold: 50 },
      T7s: { raise: 50, fold: 50 },
      '86s': { raise: 50, fold: 50 },
      '65s': { raise: 50, fold: 50 },
      A6o: { raise: 60, fold: 40 },
      K9o: { raise: 70, fold: 30 },
      Q9o: { raise: 60, fold: 40 },
      J9o: { raise: 60, fold: 40 },
      T9o: { raise: 50, fold: 50 },
    },
  },
  '6max_20bb_SB_RFI': {
    label: 'SB abre (20bb, shove-ish)',
    type: 'rfi',
    raise: '',
    allin: '22+, A2s+, K9s+, Q9s+, J9s+, T9s, 98s, A7o+, KJo+, QJo',
    mixed: {
      K8s: { allin: 70, fold: 30 },
      Q8s: { allin: 60, fold: 40 },
      J8s: { allin: 50, fold: 50 },
      T8s: { allin: 50, fold: 50 },
      '87s': { allin: 50, fold: 50 },
      A6o: { allin: 70, fold: 30 },
      A5o: { allin: 80, fold: 20 },
      A4o: { allin: 60, fold: 40 },
      K9o: { allin: 60, fold: 40 },
      KTo: { allin: 80, fold: 20 },
      QTo: { allin: 70, fold: 30 },
      JTo: { allin: 60, fold: 40 },
    },
  },
  '6max_20bb_BB_vs_UTG_open': {
    label: 'BB defende vs UTG (20bb)',
    type: 'facing',
    raise: '',
    allin: 'QQ+, AKs, AKo, A5s',
    call: '99-22, ATs-A9s, KTs+, QTs+, JTs, T9s, 98s, AQo',
    mixed: {
      JJ: { allin: 70, call: 30, fold: 0 },
      TT: { allin: 40, call: 60, fold: 0 },
      AJs: { allin: 30, call: 70, fold: 0 },
    },
  },
  '6max_20bb_BB_vs_HJ_open': {
    label: 'BB defende vs HJ (20bb)',
    type: 'facing',
    raise: '',
    allin: 'QQ+, AKs, AKo, AQs, A5s, A4s',
    call: 'JJ-22, AJs-A8s, KTs+, Q9s+, J9s+, T9s, 98s, 87s, AJo, KJo, QJo',
    mixed: {
      AJs: { allin: 30, call: 70, fold: 0 },
      KJs: { allin: 20, call: 80, fold: 0 },
    },
  },
  '6max_20bb_BB_vs_CO_open': {
    label: 'BB defende vs CO (20bb)',
    type: 'facing',
    raise: '',
    allin: 'QQ+, AKs, AKo, AQs, AJs, A5s, A4s, KQs',
    call:
      'JJ-22, ATs-A6s, K9s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s, AJo, ATo, KJo, QJo, JTo',
    mixed: {
      AJs: { allin: 40, call: 60, fold: 0 },
      KJs: { allin: 30, call: 70, fold: 0 },
    },
  },
  '6max_20bb_BB_vs_BTN_open': {
    label: 'BB defende vs BTN (20bb)',
    type: 'facing',
    raise: '',
    allin: 'QQ+, AKs, AKo, AQs, AJs, ATs, A5s, A4s, KQs, KJs',
    call:
      'JJ-22, AQo-A2o, A9s-A6s, K2s+, Q7s+, J8s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, KTo+, QTo+, JTo, T9o, 98o',
    mixed: {
      KTs: { allin: 30, call: 70, fold: 0 },
      AJo: { allin: 40, call: 60, fold: 0 },
    },
  },
  '6max_20bb_BB_vs_SB_open': {
    label: 'BB defende vs SB (20bb)',
    type: 'facing',
    raise: '',
    allin: 'TT+, AKs, AKo, AQs, AQo, AJs, ATs, A5s, A4s, KQs',
    call:
      '99-22, A9s-A2s, AJo-A2o, K2s+, Q4s+, J7s+, T7s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, KTo+, QTo+, J9o+, T9o, 98o, 87o, 76o',
    mixed: {
      KJs: { allin: 40, call: 60, fold: 0 },
      QJs: { allin: 20, call: 80, fold: 0 },
    },
  },

  // =============================================================
  // 50BB — 9-MAX (simplificado)
  // =============================================================
  '9max_50bb_UTG_RFI': {
    label: 'UTG abre (9max, 50bb)',
    type: 'rfi',
    raise: '88+, ATs+, KTs+, QJs, JTs, T9s, AJo+, KQs',
    mixed: {
      '77': { raise: 50, fold: 50 },
      A9s: { raise: 50, fold: 50 },
      KJo: { raise: 50, fold: 50 },
    },
  },
  '9max_50bb_MP_RFI': {
    label: 'MP abre (9max, 50bb)',
    type: 'rfi',
    raise: '66+, A9s+, KTs+, QTs+, JTs, T9s, 98s, AJo+, KQs',
    mixed: {
      '55': { raise: 50, fold: 50 },
      A8s: { raise: 60, fold: 40 },
      '87s': { raise: 40, fold: 60 },
      KJo: { raise: 60, fold: 40 },
    },
  },
  '9max_50bb_CO_RFI': {
    label: 'CO abre (9max, 50bb)',
    type: 'rfi',
    raise: '22+, A7s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, A9o+, KTo+, QJo',
    mixed: {
      K8s: { raise: 60, fold: 40 },
      Q8s: { raise: 50, fold: 50 },
      '76s': { raise: 50, fold: 50 },
      KTo: { raise: 60, fold: 40 },
    },
  },
  '9max_50bb_BTN_RFI': {
    label: 'BTN abre (9max, 50bb)',
    type: 'rfi',
    raise: '22+, A2s+, K7s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 75s+, 65s, A7o+, KTo+, QTo+, JTo',
    mixed: {
      K6s: { raise: 60, fold: 40 },
      Q7s: { raise: 50, fold: 50 },
      J7s: { raise: 50, fold: 50 },
      T7s: { raise: 50, fold: 50 },
      '96s': { raise: 50, fold: 50 },
      '54s': { raise: 50, fold: 50 },
      A6o: { raise: 60, fold: 40 },
      K9o: { raise: 70, fold: 30 },
      Q9o: { raise: 60, fold: 40 },
      J9o: { raise: 50, fold: 50 },
    },
  },
  '9max_50bb_SB_RFI': {
    label: 'SB abre (9max, 50bb)',
    type: 'rfi',
    raise: '22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, A7o+, KTo+, QJo',
    mixed: {
      K7s: { raise: 60, fold: 40 },
      Q8s: { raise: 60, fold: 40 },
      '96s': { raise: 50, fold: 50 },
      A6o: { raise: 70, fold: 30 },
      A5o: { raise: 80, fold: 20 },
      K9o: { raise: 60, fold: 40 },
    },
  },
  '9max_50bb_BB_vs_UTG_open': {
    label: 'BB defende vs UTG (9max, 50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo',
    call: 'JJ-22, AQs-A8s, KTs+, QTs+, JTs, T9s, 98s, 87s, AQo, KQo',
    mixed: {
      JJ: { raise: 60, call: 40, fold: 0 },
      AJs: { raise: 30, call: 70, fold: 0 },
      AJo: { raise: 20, call: 60, fold: 20 },
    },
  },
  '9max_50bb_BB_vs_CO_open': {
    label: 'BB defende vs CO (9max, 50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s',
    call:
      'JJ-22, AJs-A6s, K9s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s, AJo, ATo, KJo, QJo',
    mixed: {
      AQo: { raise: 40, call: 60, fold: 0 },
      KJs: { raise: 20, call: 80, fold: 0 },
    },
  },
  '9max_50bb_BB_vs_BTN_open': {
    label: 'BB defende vs BTN (9max, 50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, A5s, A4s, KQs, KJs',
    call:
      'JJ-22, AQo-A2o, ATs-A6s, K2s+, Q7s+, J8s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, KTo+, QTo+, JTo, T9o, 98o',
    mixed: {
      KTs: { raise: 30, call: 70, fold: 0 },
      AJo: { raise: 30, call: 70, fold: 0 },
    },
  },
  '9max_50bb_BB_vs_SB_open': {
    label: 'BB defende vs SB (9max, 50bb)',
    type: 'facing',
    raise: 'TT+, AKs, AKo, AQs, AQo, AJs, A5s, A4s, KQs',
    call:
      '99-22, AJs-A2s, AJo-A2o, K2s+, Q4s+, J7s+, T7s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, KTo+, QTo+, J9o+, T9o, 98o, 87o, 76o',
    mixed: {
      KJs: { raise: 40, call: 60, fold: 0 },
    },
  },

  // =============================================================
  // 20BB — 9-MAX (simplificado)
  // =============================================================
  '9max_20bb_UTG_RFI': {
    label: 'UTG abre (9max, 20bb)',
    type: 'rfi',
    raise: '88+, ATs+, KJs+, QJs, AJo+, KQs',
    mixed: {
      '77': { raise: 50, fold: 50 },
      A9s: { raise: 40, fold: 60 },
    },
  },
  '9max_20bb_MP_RFI': {
    label: 'MP abre (9max, 20bb)',
    type: 'rfi',
    raise: '66+, A9s+, KTs+, QTs+, JTs, AJo+, KQs',
    mixed: {
      '55': { raise: 50, fold: 50 },
      A8s: { raise: 50, fold: 50 },
    },
  },
  '9max_20bb_CO_RFI': {
    label: 'CO abre (9max, 20bb)',
    type: 'rfi',
    raise: '33+, A7s+, K9s+, QTs+, JTs, T9s, 98s, A9o+, KTo+',
    mixed: {
      '22': { raise: 50, fold: 50 },
      A6s: { raise: 50, fold: 50 },
      K8s: { raise: 50, fold: 50 },
      KJo: { raise: 60, fold: 40 },
    },
  },
  '9max_20bb_BTN_RFI': {
    label: 'BTN abre (9max, 20bb)',
    type: 'rfi',
    raise: '22+, A2s+, K7s+, Q9s+, J8s+, T8s+, 97s+, 87s, 76s, A7o+, KTo+, QTo+, JTo',
    mixed: {
      K6s: { raise: 50, fold: 50 },
      Q8s: { raise: 50, fold: 50 },
      '86s': { raise: 40, fold: 60 },
      K9o: { raise: 60, fold: 40 },
      Q9o: { raise: 50, fold: 50 },
    },
  },
  '9max_20bb_SB_RFI': {
    label: 'SB abre (9max, 20bb)',
    type: 'rfi',
    raise: '22+, A2s+, K9s+, Q9s+, J9s+, T9s, 98s, A7o+, KJo+, QJo',
    mixed: {
      K8s: { raise: 60, fold: 40 },
      Q8s: { raise: 50, fold: 50 },
      A6o: { raise: 60, fold: 40 },
      A5o: { raise: 70, fold: 30 },
      KTo: { raise: 70, fold: 30 },
      Q9o: { raise: 50, fold: 50 },
    },
  },
  '9max_20bb_BB_vs_UTG_open': {
    label: 'BB defende vs UTG (9max, 20bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo',
    call: 'JJ-22, AQs-A9s, KTs+, QTs+, JTs, T9s, 98s, AQo, KQo',
    mixed: {
      JJ: { raise: 60, call: 40, fold: 0 },
      AJs: { raise: 30, call: 70, fold: 0 },
    },
  },
  '9max_20bb_BB_vs_CO_open': {
    label: 'BB defende vs CO (9max, 20bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s',
    call:
      'JJ-22, AJs-A7s, K9s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s, AJo, ATo, KJo, QJo',
    mixed: {
      AQo: { raise: 40, call: 60, fold: 0 },
    },
  },
  '9max_20bb_BB_vs_BTN_open': {
    label: 'BB defende vs BTN (9max, 20bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, ATs, A5s, A4s, KQs, KJs',
    call:
      'JJ-22, AQo-A2o, A9s-A6s, K2s+, Q7s+, J8s+, T7s+, 96s+, 86s+, 75s+, 65s, 54s, KTo+, QTo+, JTo, T9o, 98o',
    mixed: {
      AJo: { raise: 30, call: 70, fold: 0 },
    },
  },
  '9max_20bb_BB_vs_SB_open': {
    label: 'BB defende vs SB (9max, 20bb)',
    type: 'facing',
    raise: 'TT+, AKs, AKo, AQs, AQo, AJs, A5s, A4s, KQs',
    call:
      '99-22, A9s-A2s, AJo-A2o, K2s+, Q4s+, J7s+, T7s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, KTo+, QTo+, J9o+, T9o, 98o, 87o, 76o',
    mixed: {
      KJs: { raise: 40, call: 60, fold: 0 },
    },
  },

  // =============================================================
  // 3-BET POTS — 6-MAX 100BB (opener decide 4-bet / call / fold)
  // =============================================================
  '6max_100bb_UTG_vs_HJ_3bet': {
    label: 'UTG abriu, HJ deu 3-bet',
    type: 'facing',
    raise: 'KK+, AKs',
    call: 'QQ-JJ, AQs, AKo',
    mixed: {
      QQ: { raise: 40, call: 60, fold: 0 },
      AJs: { raise: 0, call: 50, fold: 50 },
      KQs: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_100bb_UTG_vs_CO_3bet': {
    label: 'UTG abriu, CO deu 3-bet',
    type: 'facing',
    raise: 'KK+, AKs, A5s',
    call: 'QQ-JJ, AQs, AQo, AKo, AJs, KQs',
    mixed: {
      QQ: { raise: 50, call: 50, fold: 0 },
      TT: { raise: 0, call: 40, fold: 60 },
      KJs: { raise: 0, call: 30, fold: 70 },
    },
  },
  '6max_100bb_UTG_vs_BTN_3bet': {
    label: 'UTG abriu, BTN deu 3-bet',
    type: 'facing',
    raise: 'QQ+, AKs, A5s',
    call: 'JJ-TT, AQs, AQo, AKo, AJs, KQs',
    mixed: {
      JJ: { raise: 30, call: 70, fold: 0 },
      '99': { raise: 0, call: 40, fold: 60 },
      KJs: { raise: 0, call: 30, fold: 70 },
      ATs: { raise: 0, call: 30, fold: 70 },
    },
  },
  '6max_100bb_UTG_vs_SB_3bet': {
    label: 'UTG abriu, SB deu 3-bet',
    type: 'facing',
    raise: 'QQ+, AKs, A5s, A4s',
    call: 'JJ-TT, AQs, AQo, AKo, AJs, KQs, KJs',
    mixed: {
      '99': { raise: 0, call: 50, fold: 50 },
      ATs: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_100bb_UTG_vs_BB_3bet': {
    label: 'UTG abriu, BB deu 3-bet',
    type: 'facing',
    raise: 'QQ+, AKs, A5s, A4s',
    call: 'JJ-99, AQs, AQo, AKo, AJs, ATs, KQs, KJs',
    mixed: {
      '88': { raise: 0, call: 50, fold: 50 },
      KTs: { raise: 0, call: 40, fold: 60 },
      QJs: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_100bb_HJ_vs_CO_3bet': {
    label: 'HJ abriu, CO deu 3-bet',
    type: 'facing',
    raise: 'KK+, AKs, A5s',
    call: 'QQ-TT, AQs-AJs, AKo, KQs',
    mixed: {
      QQ: { raise: 40, call: 60, fold: 0 },
      AQo: { raise: 0, call: 50, fold: 50 },
      KJs: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_100bb_HJ_vs_BTN_3bet': {
    label: 'HJ abriu, BTN deu 3-bet',
    type: 'facing',
    raise: 'QQ+, AKs, A5s, A4s',
    call: 'JJ-TT, AQs-ATs, AKo, AQo, KQs, KJs',
    mixed: {
      JJ: { raise: 30, call: 70, fold: 0 },
      '99': { raise: 0, call: 40, fold: 60 },
      QJs: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_100bb_HJ_vs_SB_3bet': {
    label: 'HJ abriu, SB deu 3-bet',
    type: 'facing',
    raise: 'QQ+, AKs, A5s, A4s',
    call: 'JJ-TT, AQs-ATs, AKo, AQo, KQs, KJs, QJs',
    mixed: {
      '99': { raise: 0, call: 40, fold: 60 },
      JTs: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_100bb_HJ_vs_BB_3bet': {
    label: 'HJ abriu, BB deu 3-bet',
    type: 'facing',
    raise: 'QQ+, AKs, A5s, A4s, A3s',
    call: 'JJ-99, AQs-A9s, AKo, AQo, KQs, KJs, QJs, JTs',
    mixed: {
      '88': { raise: 0, call: 50, fold: 50 },
      T9s: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_100bb_CO_vs_BTN_3bet': {
    label: 'CO abriu, BTN deu 3-bet',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s',
    call: 'JJ-99, AQs-ATs, AQo, KQs, KJs, QJs, JTs',
    mixed: {
      '88': { raise: 0, call: 50, fold: 50 },
      A9s: { raise: 0, call: 40, fold: 60 },
      KTs: { raise: 0, call: 50, fold: 50 },
    },
  },
  '6max_100bb_CO_vs_SB_3bet': {
    label: 'CO abriu, SB deu 3-bet',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s, A3s',
    call: 'JJ-88, AQs-A9s, AQo, KQs, KJs, QJs, JTs, T9s',
    mixed: {
      '77': { raise: 0, call: 40, fold: 60 },
      KTs: { raise: 0, call: 50, fold: 50 },
    },
  },
  '6max_100bb_CO_vs_BB_3bet': {
    label: 'CO abriu, BB deu 3-bet',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s, A3s',
    call:
      'JJ-77, AQs-A8s, AJo, AQo, KQs, KJs, KTs, QJs, QTs, JTs, T9s, 98s',
    mixed: {
      '66': { raise: 0, call: 40, fold: 60 },
      '87s': { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_100bb_BTN_vs_SB_3bet': {
    label: 'BTN abriu, SB deu 3-bet',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s, A3s',
    call:
      'JJ-77, AQs-A9s, AQo, AJo, KQs-KTs, QJs-QTs, JTs, T9s, 98s',
    mixed: {
      '66': { raise: 0, call: 40, fold: 60 },
      '55': { raise: 0, call: 30, fold: 70 },
      A8s: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_100bb_BTN_vs_BB_3bet': {
    label: 'BTN abriu, BB deu 3-bet',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s, A3s',
    call:
      'JJ-55, AQs-A8s, AJo+, KQs-KTs, QJs-QTs, JTs, T9s, 98s, 87s',
    mixed: {
      '44': { raise: 0, call: 40, fold: 60 },
      '33': { raise: 0, call: 30, fold: 70 },
      '76s': { raise: 0, call: 30, fold: 70 },
    },
  },
  '6max_100bb_SB_vs_BB_3bet': {
    label: 'SB abriu, BB deu 3-bet',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s, A3s',
    call:
      'JJ-77, AJs-A8s, AJo+, KQs-KTs, QJs-QTs, JTs, T9s, 98s, AQo',
    mixed: {
      '66': { raise: 0, call: 40, fold: 60 },
      '87s': { raise: 0, call: 40, fold: 60 },
    },
  },

  // =============================================================
  // 3-BET POTS — 6-MAX 50BB (ranges mais tight, SPR menor)
  // =============================================================
  '6max_50bb_UTG_vs_HJ_3bet': {
    label: 'UTG abriu, HJ deu 3-bet (50bb)',
    type: 'facing',
    raise: 'KK+, AKs',
    call: 'QQ-JJ, AQs',
    mixed: {
      QQ: { raise: 50, call: 50, fold: 0 },
      AKo: { raise: 30, call: 40, fold: 30 },
    },
  },
  '6max_50bb_UTG_vs_CO_3bet': {
    label: 'UTG abriu, CO deu 3-bet (50bb)',
    type: 'facing',
    raise: 'KK+, AKs',
    call: 'QQ-JJ, AQs, AKo',
    mixed: {
      QQ: { raise: 50, call: 50, fold: 0 },
      AJs: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_50bb_UTG_vs_BTN_3bet': {
    label: 'UTG abriu, BTN deu 3-bet (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, A5s',
    call: 'JJ-TT, AQs, AKo',
    mixed: {
      JJ: { raise: 30, call: 70, fold: 0 },
      AJs: { raise: 0, call: 40, fold: 60 },
      KQs: { raise: 0, call: 30, fold: 70 },
    },
  },
  '6max_50bb_UTG_vs_SB_3bet': {
    label: 'UTG abriu, SB deu 3-bet (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, A5s',
    call: 'JJ-TT, AQs, AKo, AJs',
    mixed: {
      '99': { raise: 0, call: 40, fold: 60 },
      KQs: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_50bb_UTG_vs_BB_3bet': {
    label: 'UTG abriu, BB deu 3-bet (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, A5s, A4s',
    call: 'JJ-99, AQs, AKo, AJs, KQs',
    mixed: {
      '88': { raise: 0, call: 40, fold: 60 },
      AQo: { raise: 0, call: 40, fold: 60 },
      KJs: { raise: 0, call: 30, fold: 70 },
    },
  },
  '6max_50bb_HJ_vs_CO_3bet': {
    label: 'HJ abriu, CO deu 3-bet (50bb)',
    type: 'facing',
    raise: 'KK+, AKs, A5s',
    call: 'QQ-JJ, AQs, AJs, AKo',
    mixed: {
      QQ: { raise: 40, call: 60, fold: 0 },
      KQs: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_50bb_HJ_vs_BTN_3bet': {
    label: 'HJ abriu, BTN deu 3-bet (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, A5s, A4s',
    call: 'JJ-TT, AQs-AJs, AKo, KQs',
    mixed: {
      JJ: { raise: 30, call: 70, fold: 0 },
      AQo: { raise: 0, call: 40, fold: 60 },
      ATs: { raise: 0, call: 30, fold: 70 },
    },
  },
  '6max_50bb_HJ_vs_SB_3bet': {
    label: 'HJ abriu, SB deu 3-bet (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, A5s, A4s',
    call: 'JJ-TT, AQs-ATs, AKo, KQs, KJs',
    mixed: {
      '99': { raise: 0, call: 40, fold: 60 },
      QJs: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_50bb_HJ_vs_BB_3bet': {
    label: 'HJ abriu, BB deu 3-bet (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, A5s, A4s',
    call: 'JJ-99, AQs-ATs, AKo, KQs, KJs, QJs',
    mixed: {
      '88': { raise: 0, call: 40, fold: 60 },
      AQo: { raise: 0, call: 40, fold: 60 },
      JTs: { raise: 0, call: 30, fold: 70 },
    },
  },
  '6max_50bb_CO_vs_BTN_3bet': {
    label: 'CO abriu, BTN deu 3-bet (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s',
    call: 'JJ-99, AQs-ATs, KQs, KJs, QJs',
    mixed: {
      '88': { raise: 0, call: 40, fold: 60 },
      AQo: { raise: 0, call: 50, fold: 50 },
      JTs: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_50bb_CO_vs_SB_3bet': {
    label: 'CO abriu, SB deu 3-bet (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s, A3s',
    call: 'JJ-99, AQs-A9s, KQs, KJs, QJs, JTs',
    mixed: {
      '88': { raise: 0, call: 40, fold: 60 },
      KTs: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_50bb_CO_vs_BB_3bet': {
    label: 'CO abriu, BB deu 3-bet (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s, A3s',
    call: 'JJ-88, AQs-A9s, KQs, KJs, QJs, JTs, T9s',
    mixed: {
      '77': { raise: 0, call: 40, fold: 60 },
      AQo: { raise: 0, call: 40, fold: 60 },
      KTs: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_50bb_BTN_vs_SB_3bet': {
    label: 'BTN abriu, SB deu 3-bet (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s, A3s',
    call: 'JJ-88, AQs-A9s, AQo, KQs-KTs, QJs-QTs, JTs, T9s',
    mixed: {
      '77': { raise: 0, call: 40, fold: 60 },
      '66': { raise: 0, call: 30, fold: 70 },
      AJo: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_50bb_BTN_vs_BB_3bet': {
    label: 'BTN abriu, BB deu 3-bet (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s, A3s',
    call: 'JJ-77, AQs-A9s, AJo+, KQs-KTs, QJs-QTs, JTs, T9s, 98s',
    mixed: {
      '66': { raise: 0, call: 40, fold: 60 },
      '55': { raise: 0, call: 30, fold: 70 },
      '87s': { raise: 0, call: 30, fold: 70 },
    },
  },
  '6max_50bb_SB_vs_BB_3bet': {
    label: 'SB abriu, BB deu 3-bet (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s, A3s',
    call: 'JJ-88, AJs-A9s, AQo, KQs-KTs, QJs-QTs, JTs, T9s',
    mixed: {
      '77': { raise: 0, call: 40, fold: 60 },
      AJo: { raise: 0, call: 40, fold: 60 },
      '98s': { raise: 0, call: 30, fold: 70 },
    },
  },

  // =============================================================
  // 3-BET POTS — 6-MAX 20BB (4-bet = shove; ranges polarizados)
  // =============================================================
  '6max_20bb_UTG_vs_HJ_3bet': {
    label: 'UTG abriu, HJ deu 3-bet (20bb, 4bet = shove)',
    type: 'facing',
    raise: '',
    allin: 'QQ+, AKs, AKo',
    call: 'JJ-TT, AQs',
    mixed: {
      JJ: { allin: 50, call: 50, fold: 0 },
      AJs: { allin: 0, call: 40, fold: 60 },
    },
  },
  '6max_20bb_UTG_vs_CO_3bet': {
    label: 'UTG abriu, CO deu 3-bet (20bb)',
    type: 'facing',
    raise: '',
    allin: 'QQ+, AKs, AKo',
    call: 'JJ-TT, AQs, AJs',
    mixed: {
      JJ: { allin: 40, call: 60, fold: 0 },
      KQs: { allin: 0, call: 30, fold: 70 },
    },
  },
  '6max_20bb_UTG_vs_BTN_3bet': {
    label: 'UTG abriu, BTN deu 3-bet (20bb)',
    type: 'facing',
    raise: '',
    allin: 'JJ+, AKs, AKo, AQs',
    call: 'TT-99, AJs, KQs',
    mixed: {
      JJ: { allin: 70, call: 30, fold: 0 },
      AQo: { allin: 0, call: 40, fold: 60 },
    },
  },
  '6max_20bb_UTG_vs_SB_3bet': {
    label: 'UTG abriu, SB deu 3-bet (20bb)',
    type: 'facing',
    raise: '',
    allin: 'JJ+, AKs, AKo, AQs',
    call: 'TT-99, AJs, ATs, KQs',
    mixed: {
      JJ: { allin: 60, call: 40, fold: 0 },
      AQo: { allin: 0, call: 40, fold: 60 },
    },
  },
  '6max_20bb_UTG_vs_BB_3bet': {
    label: 'UTG abriu, BB deu 3-bet (20bb)',
    type: 'facing',
    raise: '',
    allin: 'JJ+, AKs, AKo, AQs',
    call: 'TT-88, AJs, ATs, KQs, KJs',
    mixed: {
      JJ: { allin: 60, call: 40, fold: 0 },
      AQo: { allin: 0, call: 50, fold: 50 },
      QJs: { allin: 0, call: 30, fold: 70 },
    },
  },
  '6max_20bb_HJ_vs_CO_3bet': {
    label: 'HJ abriu, CO deu 3-bet (20bb)',
    type: 'facing',
    raise: '',
    allin: 'QQ+, AKs, AKo',
    call: 'JJ-TT, AQs, AJs, KQs',
    mixed: {
      JJ: { allin: 50, call: 50, fold: 0 },
      AQo: { allin: 0, call: 40, fold: 60 },
    },
  },
  '6max_20bb_HJ_vs_BTN_3bet': {
    label: 'HJ abriu, BTN deu 3-bet (20bb)',
    type: 'facing',
    raise: '',
    allin: 'JJ+, AKs, AKo, AQs',
    call: 'TT-99, AJs, ATs, KQs, KJs',
    mixed: {
      JJ: { allin: 60, call: 40, fold: 0 },
      AQo: { allin: 0, call: 40, fold: 60 },
      QJs: { allin: 0, call: 30, fold: 70 },
    },
  },
  '6max_20bb_HJ_vs_SB_3bet': {
    label: 'HJ abriu, SB deu 3-bet (20bb)',
    type: 'facing',
    raise: '',
    allin: 'JJ+, AKs, AKo, AQs',
    call: 'TT-99, AJs, ATs, KQs, KJs, QJs',
    mixed: {
      JJ: { allin: 60, call: 40, fold: 0 },
      AQo: { allin: 0, call: 40, fold: 60 },
    },
  },
  '6max_20bb_HJ_vs_BB_3bet': {
    label: 'HJ abriu, BB deu 3-bet (20bb)',
    type: 'facing',
    raise: '',
    allin: 'JJ+, AKs, AKo, AQs, AJs',
    call: 'TT-88, ATs-A9s, KQs, KJs, QJs, JTs',
    mixed: {
      JJ: { allin: 70, call: 30, fold: 0 },
      AQo: { allin: 0, call: 50, fold: 50 },
      T9s: { allin: 0, call: 30, fold: 70 },
    },
  },
  '6max_20bb_CO_vs_BTN_3bet': {
    label: 'CO abriu, BTN deu 3-bet (20bb)',
    type: 'facing',
    raise: '',
    allin: 'JJ+, AKs, AKo, AQs, AJs, A5s',
    call: 'TT-99, ATs-A9s, KQs, KJs, QJs',
    mixed: {
      JJ: { allin: 70, call: 30, fold: 0 },
      AQo: { allin: 0, call: 50, fold: 50 },
      JTs: { allin: 0, call: 30, fold: 70 },
    },
  },
  '6max_20bb_CO_vs_SB_3bet': {
    label: 'CO abriu, SB deu 3-bet (20bb)',
    type: 'facing',
    raise: '',
    allin: 'JJ+, AKs, AKo, AQs, AJs, A5s',
    call: 'TT-88, ATs-A9s, KQs, KJs, QJs, JTs',
    mixed: {
      JJ: { allin: 60, call: 40, fold: 0 },
      AQo: { allin: 0, call: 40, fold: 60 },
      T9s: { allin: 0, call: 30, fold: 70 },
    },
  },
  '6max_20bb_CO_vs_BB_3bet': {
    label: 'CO abriu, BB deu 3-bet (20bb)',
    type: 'facing',
    raise: '',
    allin: 'TT+, AKs, AKo, AQs, AJs, ATs, A5s, A4s',
    call: '99-88, A9s, KQs, KJs, QJs, JTs, T9s',
    mixed: {
      TT: { allin: 60, call: 40, fold: 0 },
      AQo: { allin: 0, call: 40, fold: 60 },
      '98s': { allin: 0, call: 30, fold: 70 },
    },
  },
  '6max_20bb_BTN_vs_SB_3bet': {
    label: 'BTN abriu, SB deu 3-bet (20bb)',
    type: 'facing',
    raise: '',
    allin: 'TT+, AKs, AKo, AQs, AJs, ATs, A5s, A4s',
    call: '99-77, A9s, KQs, KJs, QJs, JTs',
    mixed: {
      TT: { allin: 60, call: 40, fold: 0 },
      '66': { allin: 0, call: 30, fold: 70 },
      AQo: { allin: 40, call: 30, fold: 30 },
      T9s: { allin: 0, call: 30, fold: 70 },
    },
  },
  '6max_20bb_BTN_vs_BB_3bet': {
    label: 'BTN abriu, BB deu 3-bet (20bb)',
    type: 'facing',
    raise: '',
    allin:
      'TT+, AKs, AKo, AQs, AJs, ATs, A9s, A5s, A4s, A3s, KQs, KJs',
    call: '99-66, A8s, KTs, QJs, QTs, JTs, T9s',
    mixed: {
      TT: { allin: 60, call: 40, fold: 0 },
      '55': { allin: 0, call: 30, fold: 70 },
      AQo: { allin: 50, call: 30, fold: 20 },
      AJo: { allin: 30, call: 30, fold: 40 },
      '98s': { allin: 0, call: 30, fold: 70 },
    },
  },
  '6max_20bb_SB_vs_BB_3bet': {
    label: 'SB abriu, BB deu 3-bet (20bb)',
    type: 'facing',
    raise: '',
    allin:
      'TT+, AKs, AKo, AQs, AJs, ATs, A9s, A5s, A4s, A3s, KQs, KJs',
    call: '99-77, A8s, KTs, QJs, QTs, JTs',
    mixed: {
      TT: { allin: 60, call: 40, fold: 0 },
      AQo: { allin: 50, call: 30, fold: 20 },
      AJo: { allin: 30, call: 30, fold: 40 },
      T9s: { allin: 0, call: 30, fold: 70 },
    },
  },

  // =============================================================
  // 6-MAX 50BB — facing non-BB (3-bet spots, SPR menor)
  // =============================================================
  '6max_50bb_HJ_vs_UTG_open': {
    label: 'HJ vs UTG open (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s',
    call: 'JJ-88, AQs, AJs, KQs',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      ATs: { raise: 20, call: 40, fold: 40 },
    },
  },
  '6max_50bb_CO_vs_UTG_open': {
    label: 'CO vs UTG open (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s',
    call: 'JJ-77, AQs, AJs, KQs, QJs',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      KJs: { raise: 0, call: 50, fold: 50 },
    },
  },
  '6max_50bb_CO_vs_HJ_open': {
    label: 'CO vs HJ open (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AJs, A5s, A4s',
    call: 'JJ-66, AQs, ATs, KQs, KJs, QJs, JTs, T9s',
    mixed: {
      TT: { raise: 40, call: 60, fold: 0 },
      A9s: { raise: 0, call: 40, fold: 60 },
      AQo: { raise: 0, call: 50, fold: 50 },
    },
  },
  '6max_50bb_BTN_vs_UTG_open': {
    label: 'BTN vs UTG open (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AJs, A5s',
    call: 'JJ-66, AQs, ATs, KQs, KJs, QJs, JTs, T9s, AQo',
    mixed: {
      TT: { raise: 40, call: 60, fold: 0 },
      '55': { raise: 0, call: 40, fold: 60 },
      AJo: { raise: 0, call: 50, fold: 50 },
    },
  },
  '6max_50bb_BTN_vs_HJ_open': {
    label: 'BTN vs HJ open (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, A5s, A4s, KQs',
    call: 'JJ-55, AQo, ATs-A8s, KTs, QTs, JTs, T9s, 98s, 87s',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      '44': { raise: 0, call: 40, fold: 60 },
      KJs: { raise: 30, call: 70, fold: 0 },
      ATo: { raise: 0, call: 50, fold: 50 },
    },
  },
  '6max_50bb_BTN_vs_CO_open': {
    label: 'BTN vs CO open (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, KQs, KJs, A5s, A4s',
    call:
      'JJ-22, ATs-A6s, Q9s+, J9s+, T8s+, 97s+, 86s+, 76s, 65s, AJo, ATo, KJo, KTo, QJo',
    mixed: {
      TT: { raise: 50, call: 50, fold: 0 },
      A5s: { raise: 70, call: 30, fold: 0 },
      KTs: { raise: 30, call: 70, fold: 0 },
    },
  },
  '6max_50bb_SB_vs_UTG_open': {
    label: 'SB vs UTG open (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s',
    call: 'JJ-99, AJs, KQs',
    mixed: {
      TT: { raise: 60, call: 40, fold: 0 },
      '88': { raise: 0, call: 50, fold: 50 },
      AQo: { raise: 50, call: 0, fold: 50 },
    },
  },
  '6max_50bb_SB_vs_HJ_open': {
    label: 'SB vs HJ open (50bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, KQs, A5s, A4s',
    call: 'JJ-88, ATs, KJs',
    mixed: {
      TT: { raise: 70, call: 30, fold: 0 },
      '77': { raise: 0, call: 40, fold: 60 },
      AQo: { raise: 60, call: 0, fold: 40 },
    },
  },
  '6max_50bb_SB_vs_CO_open': {
    label: 'SB vs CO open (50bb)',
    type: 'facing',
    raise: 'TT+, AKs, AKo, AQs, AQo, AJs, KQs, KJs, A5s, A4s, A3s',
    call: '99-77, ATs-A8s, KTs, QJs, QTs, JTs, T9s',
    mixed: {
      '66': { raise: 0, call: 40, fold: 60 },
      AJo: { raise: 50, call: 0, fold: 50 },
    },
  },
  '6max_50bb_SB_vs_BTN_open': {
    label: 'SB vs BTN open (50bb)',
    type: 'facing',
    raise:
      'TT+, AKs, AKo, AQs, AQo, AJs, ATs, KQs, KJs, KTs, QJs, A5s, A4s, A3s, A2s',
    call: '99-55, A9s-A6s, K9s, Q9s+, J9s, T9s, 98s, AJo, KQo',
    mixed: {
      '44': { raise: 0, call: 50, fold: 50 },
      ATo: { raise: 30, call: 20, fold: 50 },
    },
  },

  // =============================================================
  // 6-MAX 20BB — facing non-BB (3-bet = shove, poucas chamadas)
  // =============================================================
  '6max_20bb_HJ_vs_UTG_open': {
    label: 'HJ vs UTG open (20bb)',
    type: 'facing',
    raise: '',
    allin: 'QQ+, AKs, AKo',
    call: 'JJ-TT, AQs',
    mixed: {
      JJ: { allin: 60, call: 40, fold: 0 },
      AJs: { allin: 0, call: 40, fold: 60 },
    },
  },
  '6max_20bb_CO_vs_UTG_open': {
    label: 'CO vs UTG open (20bb)',
    type: 'facing',
    raise: '',
    allin: 'QQ+, AKs, AKo',
    call: 'JJ-TT, AQs, AJs',
    mixed: {
      JJ: { allin: 50, call: 50, fold: 0 },
      KQs: { allin: 0, call: 30, fold: 70 },
    },
  },
  '6max_20bb_CO_vs_HJ_open': {
    label: 'CO vs HJ open (20bb)',
    type: 'facing',
    raise: '',
    allin: 'QQ+, AKs, AKo',
    call: 'JJ-TT, AQs, AJs, KQs',
    mixed: {
      JJ: { allin: 50, call: 50, fold: 0 },
      '99': { allin: 0, call: 40, fold: 60 },
      AQo: { allin: 0, call: 30, fold: 70 },
    },
  },
  '6max_20bb_BTN_vs_UTG_open': {
    label: 'BTN vs UTG open (20bb)',
    type: 'facing',
    raise: '',
    allin: 'QQ+, AKs, AKo',
    call: 'JJ-TT, AQs, AJs, KQs',
    mixed: {
      JJ: { allin: 50, call: 50, fold: 0 },
      '99': { allin: 0, call: 40, fold: 60 },
      AQo: { allin: 0, call: 40, fold: 60 },
    },
  },
  '6max_20bb_BTN_vs_HJ_open': {
    label: 'BTN vs HJ open (20bb)',
    type: 'facing',
    raise: '',
    allin: 'QQ+, AKs, AKo, A5s',
    call: 'JJ-99, AQs, AJs, ATs, KQs, KJs',
    mixed: {
      JJ: { allin: 60, call: 40, fold: 0 },
      '88': { allin: 0, call: 40, fold: 60 },
      AQo: { allin: 0, call: 40, fold: 60 },
      QJs: { allin: 0, call: 30, fold: 70 },
    },
  },
  '6max_20bb_BTN_vs_CO_open': {
    label: 'BTN vs CO open (20bb)',
    type: 'facing',
    raise: '',
    allin: 'JJ+, AKs, AKo, AQs, A5s, A4s',
    call: 'TT-99, AQs, AJs, ATs, KQs, KJs, QJs',
    mixed: {
      JJ: { allin: 70, call: 30, fold: 0 },
      '88': { allin: 0, call: 40, fold: 60 },
      AQo: { allin: 40, call: 30, fold: 30 },
      JTs: { allin: 0, call: 40, fold: 60 },
    },
  },
  '6max_20bb_SB_vs_UTG_open': {
    label: 'SB vs UTG open (20bb)',
    type: 'facing',
    raise: '',
    allin: 'QQ+, AKs, AKo, AQs, A5s',
    call: 'JJ-TT',
    mixed: {
      JJ: { allin: 50, call: 50, fold: 0 },
      '99': { allin: 0, call: 40, fold: 60 },
      AJs: { allin: 50, call: 0, fold: 50 },
      AQo: { allin: 70, call: 0, fold: 30 },
    },
  },
  '6max_20bb_SB_vs_HJ_open': {
    label: 'SB vs HJ open (20bb)',
    type: 'facing',
    raise: '',
    allin: 'QQ+, AKs, AKo, AQs, A5s',
    call: 'JJ-99, AJs, KQs',
    mixed: {
      JJ: { allin: 50, call: 50, fold: 0 },
      ATs: { allin: 40, call: 30, fold: 30 },
      AQo: { allin: 70, call: 0, fold: 30 },
    },
  },
  '6max_20bb_SB_vs_CO_open': {
    label: 'SB vs CO open (20bb)',
    type: 'facing',
    raise: '',
    allin: 'JJ+, AKs, AKo, AQs, AJs, A5s, A4s',
    call: 'TT-99, ATs, KQs, KJs',
    mixed: {
      JJ: { allin: 70, call: 30, fold: 0 },
      '88': { allin: 0, call: 40, fold: 60 },
      AQo: { allin: 60, call: 0, fold: 40 },
      KTs: { allin: 0, call: 40, fold: 60 },
    },
  },
  '6max_20bb_SB_vs_BTN_open': {
    label: 'SB vs BTN open (20bb)',
    type: 'facing',
    raise: '',
    allin: 'JJ+, AKs, AKo, AQs, AJs, ATs, A5s, A4s',
    call: 'TT-88, A9s, KQs, KJs, QJs',
    mixed: {
      JJ: { allin: 70, call: 30, fold: 0 },
      '77': { allin: 0, call: 40, fold: 60 },
      AQo: { allin: 60, call: 0, fold: 40 },
      AJo: { allin: 40, call: 0, fold: 60 },
      KTs: { allin: 0, call: 40, fold: 60 },
    },
  },

  // =============================================================
  // 200BB — 6-MAX (deep stack: ranges levemente mais tight OOP,
  // mais ênfase em implied odds para suited connectors e small pairs)
  // =============================================================
  '6max_200bb_UTG_RFI': {
    label: 'UTG abre (200bb deep)',
    type: 'rfi',
    raise: '22+, A8s+, A5s, A4s, KTs+, QTs+, JTs, T9s, 98s, 87s, 76s, 65s, 54s, AJo+, KQo',
    mixed: {
      A7s: { raise: 60, fold: 40 },
      A3s: { raise: 50, fold: 50 },
      A2s: { raise: 50, fold: 50 },
      K9s: { raise: 70, fold: 30 },
      ATo: { raise: 70, fold: 30 },
      KJo: { raise: 50, fold: 50 },
    },
  },
  '6max_200bb_HJ_RFI': {
    label: 'HJ abre (200bb deep)',
    type: 'rfi',
    raise: '22+, A2s+, KTs+, QTs+, J9s+, T9s, 98s, 87s, 76s, 65s, 54s, ATo+, KJo+, QJo',
    mixed: {
      K9s: { raise: 80, fold: 20 },
      Q9s: { raise: 70, fold: 30 },
      J9s: { raise: 80, fold: 20 },
      KTo: { raise: 60, fold: 40 },
      QJo: { raise: 70, fold: 30 },
      JTo: { raise: 50, fold: 50 },
    },
  },
  '6max_200bb_CO_RFI': {
    label: 'CO abre (200bb deep)',
    type: 'rfi',
    raise: '22+, A2s+, K7s+, Q9s+, J8s+, T8s+, 97s+, 86s+, 75s+, 64s+, 54s, A9o+, KTo+, QTo+, JTo',
    mixed: {
      K6s: { raise: 60, fold: 40 },
      Q8s: { raise: 70, fold: 30 },
      J7s: { raise: 60, fold: 40 },
      T7s: { raise: 70, fold: 30 },
      '96s': { raise: 70, fold: 30 },
      '85s': { raise: 70, fold: 30 },
      '74s': { raise: 60, fold: 40 },
      '53s': { raise: 60, fold: 40 },
      A8o: { raise: 70, fold: 30 },
      K9o: { raise: 60, fold: 40 },
      Q9o: { raise: 50, fold: 50 },
    },
  },
  '6max_200bb_BTN_RFI': {
    label: 'BTN abre (200bb deep)',
    type: 'rfi',
    raise: '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 95s+, 84s+, 74s+, 64s+, 53s+, 43s, A2o+, K7o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o',
    mixed: {
      Q3s: { raise: 60, fold: 40 },
      J5s: { raise: 50, fold: 50 },
      T5s: { raise: 50, fold: 50 },
      '94s': { raise: 50, fold: 50 },
      '83s': { raise: 40, fold: 60 },
      '73s': { raise: 40, fold: 60 },
      '63s': { raise: 60, fold: 40 },
      '52s': { raise: 50, fold: 50 },
      '42s': { raise: 40, fold: 60 },
      '32s': { raise: 40, fold: 60 },
      K6o: { raise: 50, fold: 50 },
      Q7o: { raise: 50, fold: 50 },
      J7o: { raise: 50, fold: 50 },
      T7o: { raise: 50, fold: 50 },
      '96o': { raise: 50, fold: 50 },
      '86o': { raise: 40, fold: 60 },
      '65o': { raise: 40, fold: 60 },
    },
  },
  '6max_200bb_SB_RFI': {
    label: 'SB abre (200bb deep, todo mundo deu fold)',
    type: 'rfi',
    raise: '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A7o+, KTo+, QTo+, JTo',
    mixed: {
      K5s: { raise: 70, fold: 30 },
      K4s: { raise: 60, fold: 40 },
      Q7s: { raise: 60, fold: 40 },
      J7s: { raise: 60, fold: 40 },
      T7s: { raise: 60, fold: 40 },
      '96s': { raise: 60, fold: 40 },
      '85s': { raise: 60, fold: 40 },
      '74s': { raise: 50, fold: 50 },
      '64s': { raise: 60, fold: 40 },
      '53s': { raise: 60, fold: 40 },
      '43s': { raise: 50, fold: 50 },
      A6o: { raise: 70, fold: 30 },
      A5o: { raise: 80, fold: 20 },
      A4o: { raise: 60, fold: 40 },
      A3o: { raise: 50, fold: 50 },
      A2o: { raise: 40, fold: 60 },
      K9o: { raise: 70, fold: 30 },
      Q9o: { raise: 60, fold: 40 },
      J9o: { raise: 60, fold: 40 },
    },
  },

  // ---------- 200BB BB defendendo vs RFI ----------
  '6max_200bb_BB_vs_UTG_open': {
    label: 'BB defende vs UTG (200bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s',
    call: 'TT-22, AQs-A6s, A3s-A2s, KTs+, QTs+, JTs, T9s, 98s, 87s, 76s, 65s, AQo, KQo',
    mixed: {
      JJ: { raise: 50, call: 50, fold: 0 },
      AJs: { raise: 30, call: 70, fold: 0 },
      KQs: { raise: 30, call: 70, fold: 0 },
      AJo: { raise: 30, call: 70, fold: 0 },
      '54s': { raise: 0, call: 80, fold: 20 },
    },
  },
  '6max_200bb_BB_vs_HJ_open': {
    label: 'BB defende vs HJ (200bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s, KQs',
    call:
      'JJ-22, AJs-A6s, A3s-A2s, K9s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, AJo, KJo, QJo, JTo',
    mixed: {
      AQo: { raise: 40, call: 60, fold: 0 },
      KJs: { raise: 30, call: 70, fold: 0 },
      ATo: { raise: 0, call: 70, fold: 30 },
    },
  },
  '6max_200bb_BB_vs_CO_open': {
    label: 'BB defende vs CO (200bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s, KQs',
    call:
      'JJ-22, AJs-A6s, A3s-A2s, K8s+, Q8s+, J8s+, T7s+, 96s+, 85s+, 74s+, 64s+, 54s, AJo, ATo, KJo, QJo, JTo',
    mixed: {
      AQo: { raise: 50, call: 50, fold: 0 },
      KJs: { raise: 30, call: 70, fold: 0 },
      A5o: { raise: 30, call: 30, fold: 40 },
    },
  },
  '6max_200bb_BB_vs_BTN_open': {
    label: 'BB defende vs BTN (200bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, A5s, A4s, KQs',
    call:
      'JJ-22, AQo, AJo, ATo, A9o-A2o, ATs-A6s, A3s-A2s, K2s+, Q5s+, J7s+, T7s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, KTo+, QTo+, J9o+, T9o, 98o, 87o, 76o',
    mixed: {
      AJs: { raise: 40, call: 60, fold: 0 },
      KJs: { raise: 30, call: 70, fold: 0 },
      KTs: { raise: 20, call: 80, fold: 0 },
    },
  },
  '6max_200bb_BB_vs_SB_open': {
    label: 'BB defende vs SB (200bb)',
    type: 'facing',
    raise: 'TT+, AKs, AKo, AQs, AQo, AJs, A5s, A4s, KQs',
    call:
      '99-22, AJo-A2o, A9s-A6s, A3s-A2s, K2s+, Q4s+, J7s+, T7s+, 96s+, 85s+, 74s+, 64s+, 53s+, 43s, KTo+, QTo+, J9o+, T9o, 98o, 87o, 76o, 65o',
    mixed: {
      KJs: { raise: 30, call: 70, fold: 0 },
      QJs: { raise: 20, call: 80, fold: 0 },
    },
  },

  // ---------- 200BB facing non-BB ----------
  '6max_200bb_HJ_vs_UTG_open': {
    label: 'HJ vs UTG open (200bb)',
    type: 'facing',
    raise: 'QQ+, AKs',
    call: 'JJ-22, AQs-ATs, A5s, A4s, KQs, KJs, QJs, JTs, T9s, 98s, 87s, 76s, AQo',
    mixed: {
      JJ: { raise: 30, call: 70, fold: 0 },
      AKo: { raise: 60, call: 40, fold: 0 },
      AJs: { raise: 0, call: 80, fold: 20 },
    },
  },
  '6max_200bb_CO_vs_UTG_open': {
    label: 'CO vs UTG open (200bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s',
    call: 'JJ-22, AQs-A9s, KTs+, Q9s+, J9s+, T9s, 98s, 87s, 76s, 65s, AQo, KQo',
    mixed: {
      JJ: { raise: 40, call: 60, fold: 0 },
      AJs: { raise: 0, call: 80, fold: 20 },
    },
  },
  '6max_200bb_CO_vs_HJ_open': {
    label: 'CO vs HJ open (200bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s, KQs',
    call: 'JJ-22, AQs-A8s, K9s+, Q9s+, J9s+, T8s+, 98s, 87s, 76s, 65s, 54s, AQo, AJo, KJo+, QJo',
    mixed: {
      AJs: { raise: 30, call: 70, fold: 0 },
      KJs: { raise: 30, call: 70, fold: 0 },
      AQo: { raise: 40, call: 60, fold: 0 },
    },
  },
  '6max_200bb_BTN_vs_UTG_open': {
    label: 'BTN vs UTG open (200bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s',
    call: 'JJ-22, AQs-A8s, KTs+, Q9s+, J9s+, T9s, 98s, 87s, 76s, 65s, 54s, AQo, KQo',
    mixed: {
      JJ: { raise: 40, call: 60, fold: 0 },
      AJs: { raise: 0, call: 80, fold: 20 },
    },
  },
  '6max_200bb_BTN_vs_HJ_open': {
    label: 'BTN vs HJ open (200bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s, KQs',
    call: 'JJ-22, AJs, ATs, A9s, K9s+, Q9s+, J9s+, T8s+, 98s, 87s, 76s, 65s, 54s, AQo, AJo, KJo+, QJo',
    mixed: {
      AJs: { raise: 30, call: 70, fold: 0 },
      KJs: { raise: 30, call: 70, fold: 0 },
      AQo: { raise: 50, call: 50, fold: 0 },
      ATo: { raise: 0, call: 60, fold: 40 },
    },
  },
  '6max_200bb_BTN_vs_CO_open': {
    label: 'BTN vs CO open (200bb)',
    type: 'facing',
    raise: 'JJ+, AKs, AKo, AQs, AJs, A5s, A4s, A3s, KQs, KJs',
    call: 'TT-22, ATs-A6s, A2s, K8s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, AQo, AJo, ATo, KQo, KJo, QJo, JTo, T9o, 98o',
    mixed: {
      KTs: { raise: 30, call: 70, fold: 0 },
      QJs: { raise: 30, call: 70, fold: 0 },
      AQo: { raise: 50, call: 50, fold: 0 },
    },
  },
  '6max_200bb_SB_vs_UTG_open': {
    label: 'SB vs UTG open (200bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s',
    call: 'JJ-77, AQs-ATs, KTs+, QTs+, JTs, T9s, AQo, KQo',
    mixed: {
      JJ: { raise: 40, call: 60, fold: 0 },
      AJs: { raise: 30, call: 70, fold: 0 },
    },
  },
  '6max_200bb_SB_vs_HJ_open': {
    label: 'SB vs HJ open (200bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s',
    call: 'JJ-66, ATs-A9s, KTs+, QTs+, JTs, T9s, 98s, AJo, AQo, KQo',
    mixed: {
      JJ: { raise: 50, call: 50, fold: 0 },
      AJs: { raise: 40, call: 60, fold: 0 },
      KJs: { raise: 30, call: 70, fold: 0 },
    },
  },
  '6max_200bb_SB_vs_CO_open': {
    label: 'SB vs CO open (200bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, AJs, A5s, A4s, KQs',
    call: 'JJ-55, ATs-A8s, K9s+, Q9s+, J9s+, T9s, 98s, 87s, AJo, AQo, KQo, KJo, QJo',
    mixed: {
      JJ: { raise: 60, call: 40, fold: 0 },
      AJs: { raise: 40, call: 60, fold: 0 },
      KJs: { raise: 30, call: 70, fold: 0 },
    },
  },
  '6max_200bb_SB_vs_BTN_open': {
    label: 'SB vs BTN open (200bb)',
    type: 'facing',
    raise:
      'TT+, AKs, AKo, AQs, AQo, AJs, ATs, KQs, KJs, KTs, QJs, A5s, A4s, A3s, A2s',
    call: '99-22, A9s-A6s, K9s, Q9s+, J9s, T9s, 98s, 87s, 76s, AJo, KQo',
    mixed: {
      '44': { raise: 0, call: 60, fold: 40 },
      '33': { raise: 0, call: 50, fold: 50 },
      '22': { raise: 0, call: 40, fold: 60 },
      ATo: { raise: 30, call: 30, fold: 40 },
    },
  },

  // ---------- 200BB 3-bet pots (deep, polarizado) ----------
  '6max_200bb_UTG_vs_HJ_3bet': {
    label: 'UTG abriu, HJ deu 3-bet (200bb)',
    type: 'facing',
    raise: 'KK+',
    call: 'QQ-JJ, AQs, AKs, AKo',
    mixed: {
      QQ: { raise: 30, call: 70, fold: 0 },
      AJs: { raise: 0, call: 50, fold: 50 },
      KQs: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_200bb_UTG_vs_CO_3bet': {
    label: 'UTG abriu, CO deu 3-bet (200bb)',
    type: 'facing',
    raise: 'KK+, AKs',
    call: 'QQ-99, AQs, AKo, KQs',
    mixed: {
      QQ: { raise: 40, call: 60, fold: 0 },
      AJs: { raise: 0, call: 50, fold: 50 },
    },
  },
  '6max_200bb_UTG_vs_BTN_3bet': {
    label: 'UTG abriu, BTN deu 3-bet (200bb)',
    type: 'facing',
    raise: 'KK+, AKs',
    call: 'QQ-77, AQs, AJs, AKo, KQs, KJs',
    mixed: {
      QQ: { raise: 50, call: 50, fold: 0 },
      AQo: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_200bb_UTG_vs_SB_3bet': {
    label: 'UTG abriu, SB deu 3-bet (200bb)',
    type: 'facing',
    raise: 'KK+, AKs',
    call: 'QQ-99, AQs, AJs, AKo, KQs',
    mixed: {
      QQ: { raise: 40, call: 60, fold: 0 },
      AQo: { raise: 0, call: 30, fold: 70 },
    },
  },
  '6max_200bb_UTG_vs_BB_3bet': {
    label: 'UTG abriu, BB deu 3-bet (200bb)',
    type: 'facing',
    raise: 'KK+, AKs',
    call: 'QQ-77, AQs, AJs, ATs, AKo, KQs, KJs, QJs, JTs, T9s, 98s',
    mixed: {
      QQ: { raise: 40, call: 60, fold: 0 },
      AQo: { raise: 0, call: 50, fold: 50 },
    },
  },
  '6max_200bb_HJ_vs_CO_3bet': {
    label: 'HJ abriu, CO deu 3-bet (200bb)',
    type: 'facing',
    raise: 'KK+, AKs',
    call: 'QQ-88, AQs, AJs, AKo, KQs, KJs, QJs',
    mixed: {
      QQ: { raise: 40, call: 60, fold: 0 },
      AJs: { raise: 0, call: 60, fold: 40 },
    },
  },
  '6max_200bb_HJ_vs_BTN_3bet': {
    label: 'HJ abriu, BTN deu 3-bet (200bb)',
    type: 'facing',
    raise: 'KK+, AKs, A5s',
    call: 'QQ-66, AQs, AJs, ATs, AKo, KQs, KJs, QJs, JTs, T9s, 98s',
    mixed: {
      QQ: { raise: 50, call: 50, fold: 0 },
      AQo: { raise: 0, call: 50, fold: 50 },
    },
  },
  '6max_200bb_HJ_vs_SB_3bet': {
    label: 'HJ abriu, SB deu 3-bet (200bb)',
    type: 'facing',
    raise: 'KK+, AKs',
    call: 'QQ-77, AQs, AJs, ATs, AKo, KQs, KJs, QJs',
    mixed: {
      QQ: { raise: 40, call: 60, fold: 0 },
      AQo: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_200bb_HJ_vs_BB_3bet': {
    label: 'HJ abriu, BB deu 3-bet (200bb)',
    type: 'facing',
    raise: 'KK+, AKs, A5s',
    call: 'QQ-66, ATs-A9s, AQs, AJs, AKo, KQs, KJs, QJs, JTs, T9s, 98s, 87s',
    mixed: {
      QQ: { raise: 50, call: 50, fold: 0 },
      AQo: { raise: 0, call: 60, fold: 40 },
    },
  },
  '6max_200bb_CO_vs_BTN_3bet': {
    label: 'CO abriu, BTN deu 3-bet (200bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s',
    call: 'JJ-55, AQs, AJs, ATs, A9s, KQs, KJs, KTs, QJs, QTs, JTs, T9s, 98s, 87s, 76s',
    mixed: {
      JJ: { raise: 60, call: 40, fold: 0 },
      AQo: { raise: 0, call: 60, fold: 40 },
    },
  },
  '6max_200bb_CO_vs_SB_3bet': {
    label: 'CO abriu, SB deu 3-bet (200bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s',
    call: 'JJ-66, AQs, AJs, ATs, A9s, KQs, KJs, KTs, QJs, JTs, T9s, 98s',
    mixed: {
      JJ: { raise: 40, call: 60, fold: 0 },
      AQo: { raise: 0, call: 50, fold: 50 },
    },
  },
  '6max_200bb_CO_vs_BB_3bet': {
    label: 'CO abriu, BB deu 3-bet (200bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, A5s, A4s',
    call: 'JJ-55, A9s-A6s, AQs, AJs, ATs, KQs, KJs, KTs, QJs, QTs, JTs, T9s, 98s, 87s, 76s',
    mixed: {
      JJ: { raise: 50, call: 50, fold: 0 },
      AQo: { raise: 30, call: 50, fold: 20 },
    },
  },
  '6max_200bb_BTN_vs_SB_3bet': {
    label: 'BTN abriu, SB deu 3-bet (200bb)',
    type: 'facing',
    raise: 'QQ+, AKs, AKo, AQs, A5s, A4s',
    call: 'JJ-44, AJs, ATs, A9s, A8s, KQs, KJs, KTs, K9s, QJs, QTs, JTs, T9s, 98s, 87s, 76s, 65s',
    mixed: {
      JJ: { raise: 50, call: 50, fold: 0 },
      AQo: { raise: 0, call: 60, fold: 40 },
      AJo: { raise: 0, call: 40, fold: 60 },
    },
  },
  '6max_200bb_BTN_vs_BB_3bet': {
    label: 'BTN abriu, BB deu 3-bet (200bb)',
    type: 'facing',
    raise: 'JJ+, AKs, AKo, AQs, AJs, A5s, A4s, A3s',
    call: 'TT-22, ATs-A6s, A2s, KQs, KJs, KTs, K9s, QJs, QTs, Q9s, JTs, J9s, T9s, T8s, 98s, 87s, 76s, 65s, 54s, AQo, AJo, KQo',
    mixed: {
      JJ: { raise: 60, call: 40, fold: 0 },
      AQo: { raise: 30, call: 50, fold: 20 },
    },
  },
  '6max_200bb_SB_vs_BB_3bet': {
    label: 'SB abriu, BB deu 3-bet (200bb)',
    type: 'facing',
    raise: 'JJ+, AKs, AKo, AQs, AJs, A5s, A4s, A3s',
    call: 'TT-44, ATs-A6s, A2s, KQs, KJs, KTs, K9s, QJs, QTs, Q9s, JTs, J9s, T9s, T8s, 98s, 87s, 76s, 65s, AQo, AJo, KQo',
    mixed: {
      JJ: { raise: 60, call: 40, fold: 0 },
      AQo: { raise: 30, call: 50, fold: 20 },
      AJo: { raise: 0, call: 50, fold: 50 },
    },
  },
};

// =============================================================
// SIZING — tamanhos padrão de raise por stack/contexto
// Os valores são "padrão GTO" comum; o usuário pode ajustar.
// =============================================================

function defaultOpenSize(stackDepth) {
  if (stackDepth === '20bb') return 2.0;
  if (stackDepth === '50bb') return 2.2;
  return 2.5; // 100bb / 200bb
}

function defaultThreeBetSize(stackDepth, vsIsIP) {
  // vsIsIP = o oponente que vai 3-betar fica em posição pós-flop
  if (stackDepth === '20bb') return 5.5; // tipicamente é shove
  if (stackDepth === '50bb') return vsIsIP ? 6.5 : 8.0;
  if (stackDepth === '200bb') return vsIsIP ? 9.5 : 11.5;
  return vsIsIP ? 8.5 : 10.5; // 100bb
}

// vsRaiseSize já dado em bb. Retorna meu raise recomendado em bb.
function recommendedMyRaise(actionContext, stackDepth, vsRaiseSize, iAmIP) {
  if (actionContext === 'RFI') return defaultOpenSize(stackDepth);
  if (actionContext === 'facing') {
    // 3-bet: 3x IP, 4x OOP (mais leve em short stacks)
    const mult = iAmIP ? 3.0 : 4.0;
    const size = vsRaiseSize * mult;
    if (stackDepth === '20bb') return Math.min(20, Math.round(size * 2) / 2); // shove threshold
    return Math.round(size * 2) / 2;
  }
  if (actionContext === '3bet') {
    // 4-bet: 2.2x IP, 2.5x OOP
    const mult = iAmIP ? 2.2 : 2.5;
    const size = vsRaiseSize * mult;
    if (stackDepth === '20bb') return Math.min(20, Math.round(size * 2) / 2);
    return Math.round(size * 2) / 2;
  }
  return defaultOpenSize(stackDepth);
}

// Pressão = quão maior é o raise do oponente vs o padrão.
// 1.0 = padrão, > 1 = aperta minhas mãos não-premium.
function pressureFactor(actionContext, stackDepth, vsRaiseSize) {
  if (actionContext === 'RFI') return 1.0;
  const standard =
    actionContext === '3bet'
      ? defaultThreeBetSize(stackDepth, true)
      : defaultOpenSize(stackDepth);
  if (!vsRaiseSize || vsRaiseSize <= standard) return 1.0;
  return vsRaiseSize / standard;
}

// Aperta a estratégia quando o raise do oponente é grande.
// Premium puro (raise/allin = 100) e fold puro não mexem.
function applyPressure(strategy, pressure) {
  if (pressure <= 1.05) return strategy;
  if (strategy.raise === 100 || strategy.allin === 100) return strategy;
  if (strategy.fold === 100) return strategy;

  const shrink = Math.min((pressure - 1) * 0.55, 0.75);
  const newRaise = Math.round(strategy.raise * (1 - shrink * 0.6));
  const newCall = Math.round(strategy.call * (1 - shrink));
  const newAllin = Math.round(strategy.allin * (1 - shrink * 0.4));
  const newFold = 100 - newRaise - newCall - newAllin;
  return {
    fold: Math.max(0, Math.min(100, newFold)),
    call: Math.max(0, newCall),
    raise: Math.max(0, newRaise),
    allin: Math.max(0, newAllin),
  };
}

// =============================================================
// LÓGICA DE ESTRATÉGIA
// Dado um cenário e uma mão, retorna {fold, call, raise, allin} em %
// =============================================================

function getStrategy(scenarioKey, hand) {
  const scenario = SCENARIOS[scenarioKey];
  if (!scenario) return { fold: 100, call: 0, raise: 0, allin: 0 };

  // 1. Mão tem estratégia mista explícita?
  if (scenario.mixed && scenario.mixed[hand]) {
    const m = scenario.mixed[hand];
    return {
      fold: m.fold || 0,
      call: m.call || 0,
      raise: m.raise || 0,
      allin: m.allin || 0,
    };
  }

  // 2. Está no range puro de all-in (push/shove)?
  if (scenario.allin) {
    const allinSet = parseRange(scenario.allin);
    if (allinSet.has(hand)) {
      return { fold: 0, call: 0, raise: 0, allin: 100 };
    }
  }

  // 3. Está no range puro de raise?
  const raiseSet = parseRange(scenario.raise);
  if (raiseSet.has(hand)) {
    return { fold: 0, call: 0, raise: 100, allin: 0 };
  }

  // 4. Está no range puro de call (apenas em cenários "facing")?
  if (scenario.type === 'facing') {
    const callSet = parseRange(scenario.call);
    if (callSet.has(hand)) {
      return { fold: 0, call: 100, raise: 0, allin: 0 };
    }
  }

  // 5. Default: fold
  return { fold: 100, call: 0, raise: 0, allin: 0 };
}

// =============================================================
// HELPERS DE GRID
// =============================================================

function handFromIndex(i, j) {
  const r1 = RANKS[i];
  const r2 = RANKS[j];
  if (i === j) return r1 + r2;
  if (i < j) return r1 + r2 + 's';
  return r2 + r1 + 'o';
}

function getCellColor(strategy) {
  const { fold, call, raise, allin = 0 } = strategy;
  // Se 100% pura, cor sólida
  if (allin === 100) return 'bg-rose-500';
  if (raise === 100) return 'bg-emerald-500';
  if (call === 100) return 'bg-amber-400';
  if (fold === 100) return 'bg-stone-800';

  // Mista: gradiente
  // Prioriza ação dominante
  if (allin >= 50) return 'bg-rose-600/80';
  if (raise >= 50) return 'bg-emerald-600/80';
  if (call >= 50) return 'bg-amber-500/70';
  if (allin > 0) return 'bg-rose-900/60';
  return 'bg-stone-700';
}

function getCellTextColor(strategy) {
  const { fold } = strategy;
  if (fold === 100) return 'text-stone-500';
  return 'text-stone-100';
}

// =============================================================
// COMPONENTES
// =============================================================

function PokerTable({ tableSize, position }) {
  const positions = POSITIONS_6MAX;
  const radius = 80;
  const cx = 100;
  const cy = 65;

  return (
    <svg viewBox="0 0 200 130" className="w-full h-full">
      {/* Mesa */}
      <ellipse
        cx={cx}
        cy={cy}
        rx={radius}
        ry={radius * 0.55}
        fill="#1f3a2e"
        stroke="#3a5a47"
        strokeWidth="1"
      />
      <ellipse
        cx={cx}
        cy={cy}
        rx={radius - 8}
        ry={radius * 0.55 - 8}
        fill="none"
        stroke="#2d5a3d"
        strokeWidth="0.5"
      />

      {/* Posições */}
      {positions.map((pos, i) => {
        const angle = (i / positions.length) * 2 * Math.PI - Math.PI / 2;
        const x = cx + (radius + 8) * Math.cos(angle);
        const y = cy + (radius * 0.55 + 8) * Math.sin(angle);
        const isActive = pos === position;
        return (
          <g key={pos}>
            <circle
              cx={x}
              cy={y}
              r={isActive ? 9 : 6}
              fill={isActive ? '#f59e0b' : '#44403c'}
              stroke={isActive ? '#fbbf24' : '#57534e'}
              strokeWidth="1"
            />
            <text
              x={x}
              y={y + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={isActive ? '5' : '4'}
              fill={isActive ? '#1c1917' : '#d6d3d1'}
              fontWeight="bold"
            >
              {pos}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function HandGrid({ scenarioKey, selectedHand, onSelectHand, pressure = 1 }) {
  const grid = useMemo(() => {
    const cells = [];
    for (let i = 0; i < 13; i++) {
      const row = [];
      for (let j = 0; j < 13; j++) {
        const hand = handFromIndex(i, j);
        const strategy = applyPressure(getStrategy(scenarioKey, hand), pressure);
        row.push({ hand, strategy });
      }
      cells.push(row);
    }
    return cells;
  }, [scenarioKey, pressure]);

  return (
    <div className="grid grid-cols-13 gap-0.5 bg-stone-950 p-2 rounded-lg border border-stone-800">
      {grid.flat().map(({ hand, strategy }) => {
        const isSelected = hand === selectedHand;
        const colorClass = getCellColor(strategy);
        const textClass = getCellTextColor(strategy);
        return (
          <button
            key={hand}
            onClick={() => onSelectHand(hand)}
            className={`
              aspect-square text-[9px] sm:text-[10px] font-mono font-semibold
              ${colorClass} ${textClass}
              hover:ring-2 hover:ring-amber-300 hover:z-10 relative
              transition-all
              ${isSelected ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-stone-950 z-10' : ''}
            `}
            title={hand}
          >
            {hand}
          </button>
        );
      })}
    </div>
  );
}

function StrategyBar({ strategy }) {
  const { fold, call, raise, allin = 0 } = strategy;
  return (
    <div className="w-full h-8 flex rounded-md overflow-hidden border border-stone-700">
      {allin > 0 && (
        <div
          className="bg-rose-500 flex items-center justify-center text-xs font-bold text-stone-900"
          style={{ width: `${allin}%` }}
        >
          {allin >= 12 && `${allin}%`}
        </div>
      )}
      {raise > 0 && (
        <div
          className="bg-emerald-500 flex items-center justify-center text-xs font-bold text-stone-900"
          style={{ width: `${raise}%` }}
        >
          {raise >= 12 && `${raise}%`}
        </div>
      )}
      {call > 0 && (
        <div
          className="bg-amber-400 flex items-center justify-center text-xs font-bold text-stone-900"
          style={{ width: `${call}%` }}
        >
          {call >= 12 && `${call}%`}
        </div>
      )}
      {fold > 0 && (
        <div
          className="bg-stone-700 flex items-center justify-center text-xs font-semibold text-stone-300"
          style={{ width: `${fold}%` }}
        >
          {fold >= 12 && `${fold}%`}
        </div>
      )}
    </div>
  );
}

function ActionCard({ label, percent, color, recommended }) {
  return (
    <div
      className={`
        rounded-lg border p-3 transition-all
        ${recommended
          ? `${color.border} ${color.bg} shadow-lg`
          : 'border-stone-800 bg-stone-900/50'}
      `}
    >
      <div className={`text-xs uppercase tracking-wider font-semibold ${recommended ? color.text : 'text-stone-500'}`}>
        {label}
      </div>
      <div className={`text-3xl font-mono font-bold mt-1 ${recommended ? color.text : 'text-stone-400'}`}>
        {percent}
        <span className="text-base">%</span>
      </div>
    </div>
  );
}

// =============================================================
// APP PRINCIPAL
// =============================================================

export default function PokerGTOStudy() {
  const tableSize = 6;
  const [stackDepth, setStackDepth] = useState('100bb');
  const [position, setPosition] = useState('BTN');
  const [actionContext, setActionContext] = useState('RFI'); // RFI | facing | 3bet
  const [vsPosition, setVsPosition] = useState('UTG');
  const [selectedHand, setSelectedHand] = useState('AKs');
  const [vsRaiseSize, setVsRaiseSize] = useState(2.5);

  // Determina o cenário ativo
  const scenarioKey = useMemo(() => {
    const base = `6max_${stackDepth}_${position}`;
    if (actionContext === 'RFI') return `${base}_RFI`;
    if (actionContext === '3bet') return `${base}_vs_${vsPosition}_3bet`;
    return `${base}_vs_${vsPosition}_open`;
  }, [stackDepth, position, actionContext, vsPosition]);

  const scenario = SCENARIOS[scenarioKey];

  // Pressão do raise do oponente (1.0 = padrão, > 1 aperta o range)
  const pressure = useMemo(
    () => pressureFactor(actionContext, stackDepth, vsRaiseSize),
    [actionContext, stackDepth, vsRaiseSize]
  );

  const strategy = useMemo(
    () => applyPressure(getStrategy(scenarioKey, selectedHand), pressure),
    [scenarioKey, selectedHand, pressure]
  );

  // Recomendação dominante
  const recommendation = useMemo(() => {
    const { fold, call, raise, allin = 0 } = strategy;
    if (allin >= raise && allin >= call && allin >= fold && allin > 0) return 'allin';
    if (raise >= call && raise >= fold) return 'raise';
    if (call >= fold) return 'call';
    return 'fold';
  }, [strategy]);

  const positions = POSITIONS_6MAX;
  const positionIdx = positions.indexOf(position);
  const isBB = position === 'BB';
  const earlierPositions = positions.slice(0, positionIdx);
  const laterPositions = positions.slice(positionIdx + 1);
  const canRFI = !isBB;
  const canFace = earlierPositions.length > 0;
  const can3bet = !isBB && laterPositions.length > 0;

  // Corrige contexto de ação se a posição atual não permite o que está selecionado
  useEffect(() => {
    const valid =
      (actionContext === 'RFI' && canRFI) ||
      (actionContext === 'facing' && canFace) ||
      (actionContext === '3bet' && can3bet);
    if (!valid) {
      if (canRFI) setActionContext('RFI');
      else if (canFace) setActionContext('facing');
    }
  }, [canRFI, canFace, can3bet, actionContext]);

  // Garante que vsPosition seja válida pro contexto atual
  useEffect(() => {
    if (actionContext === 'facing' && earlierPositions.length > 0) {
      if (!earlierPositions.includes(vsPosition)) {
        setVsPosition(earlierPositions[0]);
      }
    } else if (actionContext === '3bet' && laterPositions.length > 0) {
      if (!laterPositions.includes(vsPosition)) {
        setVsPosition(laterPositions[0]);
      }
    }
  }, [actionContext, earlierPositions, laterPositions, vsPosition]);

  // Quem fica IP pós-flop? (BTN > CO > HJ > UTG > BB > SB na ordem pós-flop)
  // facing: vsPos é anterior pré-flop → vsPos é OOP pós-flop (a menos que eu seja SB/BB)
  // 3bet:   vsPos é posterior pré-flop → vsPos é IP pós-flop (a menos que vsPos seja SB/BB)
  const iAmIP = useMemo(() => {
    if (actionContext === 'RFI') return position === 'BTN' || position === 'CO';
    if (actionContext === 'facing') {
      return position !== 'SB' && position !== 'BB';
    }
    // 3bet: eu sou IP só se o 3-bettor é SB ou BB
    return vsPosition === 'SB' || vsPosition === 'BB';
  }, [actionContext, position, vsPosition]);

  // Reset do vsRaiseSize sempre que o contexto/stack/vsPos mudar
  useEffect(() => {
    if (actionContext === 'RFI') {
      setVsRaiseSize(defaultOpenSize(stackDepth));
    } else if (actionContext === 'facing') {
      setVsRaiseSize(defaultOpenSize(stackDepth));
    } else if (actionContext === '3bet') {
      // vsPos (3-bettor) é depois de mim → fica IP pós-flop
      setVsRaiseSize(defaultThreeBetSize(stackDepth, true));
    }
  }, [actionContext, stackDepth, vsPosition, position]);

  const myRecommendedRaise = useMemo(
    () => recommendedMyRaise(actionContext, stackDepth, vsRaiseSize, iAmIP),
    [actionContext, stackDepth, vsRaiseSize, iAmIP]
  );

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 font-sans">
      {/* CSS para grid de 13 colunas (não está nas classes default do Tailwind) */}
      <style>{`
        .grid-cols-13 { grid-template-columns: repeat(13, minmax(0, 1fr)); }
      `}</style>

      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* HEADER */}
        <header className="mb-6 pb-4 border-b border-stone-800">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight">
                Poker GTO <span className="text-emerald-400">Study</span>
              </h1>
              <p className="text-xs text-stone-500 mt-0.5 font-mono">
                preflop trainer · cash &amp; MTT · 6-max · RFI / facing / 3-bet
              </p>
            </div>
            <div className="flex gap-2 text-xs font-mono text-stone-400">
              <span className="px-2 py-1 bg-stone-900 border border-stone-800 rounded">
                v0.1 protótipo
              </span>
            </div>
          </div>
        </header>

        {/* CONFIGURADOR DE CENÁRIO */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Stack */}
          <div className="bg-stone-900/50 border border-stone-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-stone-400 uppercase tracking-wider mb-2">
              <Layers size={14} />
              <span>Profundidade</span>
            </div>
            <div className="flex gap-1">
              {['200bb', '100bb', '50bb', '20bb'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStackDepth(s)}
                  className={`
                    flex-1 py-2 rounded font-mono text-xs font-semibold transition
                    ${stackDepth === s
                      ? 'bg-emerald-500 text-stone-900'
                      : 'bg-stone-800 text-stone-300 hover:bg-stone-700'}
                  `}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-stone-600 mt-1 font-mono">
              200bb deep · 100bb cash · 50bb raso · 20bb MTT
            </div>
          </div>

          {/* Posição */}
          <div className="bg-stone-900/50 border border-stone-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-stone-400 uppercase tracking-wider mb-2">
              <Target size={14} />
              <span>Sua posição</span>
            </div>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-2 font-mono text-sm"
            >
              {positions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Ação */}
          <div className="bg-stone-900/50 border border-stone-800 rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-stone-400 uppercase tracking-wider mb-2">
              <ChevronRight size={14} />
              <span>Cenário</span>
            </div>
            <select
              value={actionContext}
              onChange={(e) => setActionContext(e.target.value)}
              className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-2 font-mono text-sm"
            >
              {canRFI && <option value="RFI">Ninguém entrou (RFI)</option>}
              {canFace && <option value="facing">Alguém deu raise</option>}
              {can3bet && <option value="3bet">Você abriu e levou 3-bet</option>}
            </select>
            {actionContext === 'facing' && earlierPositions.length > 0 && (
              <select
                value={vsPosition}
                onChange={(e) => setVsPosition(e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-2 font-mono text-sm mt-2"
              >
                {earlierPositions.map((p) => (
                  <option key={p} value={p}>
                    raise do {p}
                  </option>
                ))}
              </select>
            )}
            {actionContext === '3bet' && laterPositions.length > 0 && (
              <select
                value={vsPosition}
                onChange={(e) => setVsPosition(e.target.value)}
                className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-2 font-mono text-sm mt-2"
              >
                {laterPositions.map((p) => (
                  <option key={p} value={p}>
                    3-bet de {p}
                  </option>
                ))}
              </select>
            )}
            {actionContext !== 'RFI' && (
              <div className="mt-2">
                <label className="block text-[10px] text-stone-500 uppercase tracking-wider mb-1">
                  Tamanho do raise do {vsPosition} (bb)
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={vsRaiseSize}
                  onChange={(e) => setVsRaiseSize(parseFloat(e.target.value) || 0)}
                  className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-2 font-mono text-sm"
                />
                {pressure > 1.05 && (
                  <div className="text-[10px] text-rose-400 mt-1 font-mono">
                    +{Math.round((pressure - 1) * 100)}% acima do padrão · range apertado
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* VISUALIZAÇÃO DA MESA + INFO DO CENÁRIO */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="bg-stone-900/30 border border-stone-800 rounded-lg p-3">
            <div className="text-xs text-stone-400 uppercase tracking-wider mb-2 font-semibold">
              Mesa
            </div>
            <div className="aspect-[200/130]">
              <PokerTable tableSize={tableSize} position={position} />
            </div>
          </div>

          <div className="lg:col-span-2 bg-stone-900/30 border border-stone-800 rounded-lg p-4">
            <div className="text-xs text-stone-400 uppercase tracking-wider mb-2 font-semibold">
              Cenário ativo
            </div>
            {scenario ? (
              <>
                <div className="text-xl font-serif text-stone-100">{scenario.label}</div>
                <div className="text-sm text-stone-500 mt-1 font-mono">
                  {tableSize}-max · {stackDepth} · você está em <span className="text-amber-400">{position}</span>
                </div>
                <div className="mt-3 flex items-start gap-2 text-xs text-stone-500 bg-stone-950/50 p-2 rounded border border-stone-800/50">
                  <Info size={12} className="mt-0.5 shrink-0" />
                  <span>
                    Clique em qualquer mão da grade abaixo para ver as frequências de ação GTO recomendadas.
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-start gap-2 text-amber-400 bg-amber-950/20 p-3 rounded border border-amber-900/40">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold">Cenário ainda não cadastrado</div>
                  <div className="text-xs text-amber-300/70 mt-1">
                    Combinação de posição + ação não tem dados nesta versão. Tente outro cenário ou adicione no código.
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* HAND GRID + STRATEGY PANEL */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-stone-400 uppercase tracking-wider font-semibold">
                Range completo · clique numa mão
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono flex-wrap">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-rose-500 rounded-sm"></span>
                  <span className="text-stone-400">ALL-IN</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-emerald-500 rounded-sm"></span>
                  <span className="text-stone-400">RAISE</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-amber-400 rounded-sm"></span>
                  <span className="text-stone-400">CALL</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-stone-700 rounded-sm"></span>
                  <span className="text-stone-400">FOLD</span>
                </span>
              </div>
            </div>
            <HandGrid
              scenarioKey={scenarioKey}
              selectedHand={selectedHand}
              onSelectHand={setSelectedHand}
              pressure={pressure}
            />
          </div>

          {/* PAINEL DE RESULTADOS */}
          <div className="bg-gradient-to-br from-stone-900 to-stone-950 border border-stone-800 rounded-lg p-4">
            <div className="text-xs text-stone-400 uppercase tracking-wider mb-3 font-semibold">
              Sua mão
            </div>
            <div className="text-5xl font-serif font-bold text-amber-400 mb-1">
              {selectedHand}
            </div>
            <div className="text-xs text-stone-500 font-mono mb-4">
              {selectedHand.length === 2
                ? 'par'
                : selectedHand.endsWith('s')
                ? 'do mesmo naipe'
                : 'naipes diferentes'}
            </div>

            <div className="text-xs text-stone-400 uppercase tracking-wider mb-2 font-semibold">
              Estratégia GTO
            </div>
            <StrategyBar strategy={strategy} />

            <div className="mt-4 grid grid-cols-2 gap-2">
              <ActionCard
                label="Fold"
                percent={strategy.fold}
                color={{ border: 'border-stone-600', bg: 'bg-stone-800/80', text: 'text-stone-300' }}
                recommended={recommendation === 'fold'}
              />
              <ActionCard
                label="Call"
                percent={strategy.call}
                color={{ border: 'border-amber-500', bg: 'bg-amber-950/40', text: 'text-amber-300' }}
                recommended={recommendation === 'call'}
              />
              <ActionCard
                label="Raise"
                percent={strategy.raise}
                color={{ border: 'border-emerald-500', bg: 'bg-emerald-950/40', text: 'text-emerald-300' }}
                recommended={recommendation === 'raise'}
              />
              <ActionCard
                label="All-in"
                percent={strategy.allin || 0}
                color={{ border: 'border-rose-500', bg: 'bg-rose-950/40', text: 'text-rose-300' }}
                recommended={recommendation === 'allin'}
              />
            </div>

            {(recommendation === 'raise' || recommendation === 'allin') && (
              <div className="mt-4 pt-4 border-t border-stone-800">
                <div className="text-xs text-stone-400 uppercase tracking-wider mb-2 font-semibold">
                  Sizing recomendado
                </div>
                {recommendation === 'allin' ? (
                  <div className="font-mono text-rose-300">
                    <span className="text-2xl font-bold">All-in</span>
                    <span className="text-xs text-stone-500 ml-2">({stackDepth})</span>
                  </div>
                ) : (
                  <div className="font-mono text-emerald-300">
                    <span className="text-2xl font-bold">{myRecommendedRaise}</span>
                    <span className="text-sm ml-1">bb</span>
                    <span className="text-xs text-stone-500 ml-2">
                      {actionContext === 'RFI' && '(open padrão)'}
                      {actionContext === 'facing' && `(3-bet ${iAmIP ? 'IP' : 'OOP'} ≈ ${(myRecommendedRaise / vsRaiseSize).toFixed(1)}x)`}
                      {actionContext === '3bet' && `(4-bet ≈ ${(myRecommendedRaise / vsRaiseSize).toFixed(1)}x)`}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-stone-800">
              <div className="text-xs text-stone-500">
                {strategy.fold === 100 && (
                  <span>Mão fora do range. <span className="text-stone-300 font-semibold">Fold</span> sempre.</span>
                )}
                {strategy.raise === 100 && (
                  <span>Mão pura de raise. <span className="text-emerald-300 font-semibold">Sempre agride</span>.</span>
                )}
                {strategy.call === 100 && (
                  <span>Mão pura de call. <span className="text-amber-300 font-semibold">Sempre paga</span>, sem 3-bet.</span>
                )}
                {strategy.allin === 100 && (
                  <span>Mão pura de shove. <span className="text-rose-300 font-semibold">Sempre all-in</span> nesse stack.</span>
                )}
                {(strategy.fold > 0 && strategy.raise > 0) ||
                (strategy.call > 0 && strategy.raise > 0) ||
                (strategy.fold > 0 && strategy.call > 0) ||
                (strategy.allin > 0 && strategy.allin < 100) ? (
                  <span>
                    Mão de <span className="text-amber-300 font-semibold">estratégia mista</span> — alterne entre as ações nas frequências indicadas.
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* RODAPÉ COM AVISOS */}
        <footer className="mt-8 pt-6 border-t border-stone-800">
          <div className="text-xs text-stone-500 space-y-2 max-w-3xl">
            <div className="flex gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-500" />
              <p>
                <span className="font-semibold text-stone-300">Atenção:</span> os ranges aqui são <span className="text-amber-300">aproximações</span> baseadas em soluções GTO publicamente conhecidas para 100bb cash. Para precisão profissional use GTO Wizard, GTO+ ou PioSolver.
              </p>
            </div>
            <div className="flex gap-2">
              <Info size={14} className="shrink-0 mt-0.5 text-stone-500" />
              <p>
                Próxima feature: ranges para mesa <span className="text-amber-300">full ring (9-max)</span> — atualmente só há suporte para 6-max.
              </p>
            </div>
            <div className="pt-4 mt-2 border-t border-stone-800/60 text-center text-stone-400">
              Feito por{" "}
              <a
                href="https://projetos-three-gules.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-300 hover:text-amber-200 underline underline-offset-2 transition-colors"
              >
                Jefferson Lucas
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
