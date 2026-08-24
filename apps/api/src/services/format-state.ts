import type {
  AuctionBid,
  AuctionTeamBudget,
  CalibrationProposal,
  ContractRules,
  DraftOutcome,
  DraftPickAsset,
  DraftScoreWeights,
  DynastyMode,
  GradingBands,
} from '@draftlab/domain';
import { DEFAULT_CONTRACT_RULES } from '@draftlab/auction-engine';
import { DEFAULT_BANDS, DEFAULT_WEIGHTS } from '@draftlab/calibration-engine';

/** Mutable per-league state for dynasty / auction / calibration (in-memory). */
export class FormatState {
  dynastyMode = new Map<string, DynastyMode>();
  pickAssets = new Map<string, DraftPickAsset[]>();
  auctionBudgets = new Map<string, AuctionTeamBudget[]>();
  auctionBids = new Map<string, AuctionBid[]>();
  contractRules = new Map<string, ContractRules>();
  outcomes = new Map<string, DraftOutcome[]>();
  calibration = new Map<string, CalibrationProposal | null>();
  /** Per-league grading bands (defaults until calibration apply). */
  activeBandsByLeague = new Map<string, GradingBands>();
  /** Per-league DraftScore weights. */
  activeWeightsByLeague = new Map<string, DraftScoreWeights>();

  getActiveBands(leagueId: string): GradingBands {
    return this.activeBandsByLeague.get(leagueId) ?? { ...DEFAULT_BANDS };
  }

  getActiveWeights(leagueId: string): DraftScoreWeights {
    return this.activeWeightsByLeague.get(leagueId) ?? { ...DEFAULT_WEIGHTS };
  }

  ensureAuction(leagueId: string, teamCount: number, budget: number, rosterSlots: number, userRosterId: string) {
    if (!this.auctionBudgets.has(leagueId)) {
      const teams: AuctionTeamBudget[] = [];
      for (let i = 1; i <= teamCount; i++) {
        const rosterId = i === 1 ? userRosterId : `roster-${i}`;
        teams.push({
          rosterId,
          name: i === 1 ? 'You' : `Team ${i}`,
          startingBudget: budget,
          spent: 0,
          remaining: budget,
          rosterSlotsFilled: 0,
          rosterSlotsTotal: rosterSlots,
        });
      }
      this.auctionBudgets.set(leagueId, teams);
      this.auctionBids.set(leagueId, []);
    }
    if (!this.contractRules.has(leagueId)) {
      this.contractRules.set(leagueId, { ...DEFAULT_CONTRACT_RULES });
    }
  }

  ensureDynasty(leagueId: string, mode: DynastyMode = 'neutral') {
    if (!this.dynastyMode.has(leagueId)) this.dynastyMode.set(leagueId, mode);
  }

  applyCalibration(leagueId: string, proposal: CalibrationProposal) {
    this.activeBandsByLeague.set(leagueId, { ...proposal.proposedBands });
    this.activeWeightsByLeague.set(leagueId, { ...proposal.proposedWeights });
  }

  clearLeague(leagueId: string) {
    this.dynastyMode.delete(leagueId);
    this.pickAssets.delete(leagueId);
    this.auctionBudgets.delete(leagueId);
    this.auctionBids.delete(leagueId);
    this.contractRules.delete(leagueId);
    this.outcomes.delete(leagueId);
    this.calibration.delete(leagueId);
    this.activeBandsByLeague.delete(leagueId);
    this.activeWeightsByLeague.delete(leagueId);
  }
}
