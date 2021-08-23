import { BigNumber, BigNumberish } from 'ethers'

export class RoundManagement {
  readonly phase: BigNumber;
  readonly justRound: BigNumber;

  constructor(phase: BigNumberish, justRound: BigNumberish) {
    this.phase = BigNumber.from(phase);
    this.justRound = BigNumber.from(justRound);
  }

  public get id(): BigNumber {
    return this.phase.shl(64).or(this.justRound);
  }

  public nextRound(): RoundManagement {
    return new RoundManagement(this.phase, this.justRound.add(1));
  }

  public prevRound(): RoundManagement {
    return new RoundManagement(this.phase, this.justRound.sub(1));
  }

  static decode(roundId: BigNumberish): RoundManagement {
    roundId = BigNumber.from(roundId);
    const phase = roundId.shr(64);
    const justRoundId = roundId.sub(phase.shl(64));
    return new RoundManagement(phase, justRoundId);
  }
}
