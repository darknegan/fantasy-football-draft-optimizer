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
  activeBands: GradingBands = { ...DEFAULT_BANDS };
  activeWeights: DraftScoreWeights = { ...DEFAULT_WEIGHTS };

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

  applyCalibration(proposal: CalibrationProposal) {
    this.activeBands = { ...proposal.proposedBands };
    this.activeWeights = { ...proposal.proposedWeights };
  }
}
