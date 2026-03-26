import { randomBytes } from "node:crypto";

export type TreasuryAllocation = {
  treasuryAddress: string;
  amountEth: number;
  txHash: string;
  swapMode: "demo";
  chain: "sepolia";
};

export class SepoliaTreasury {
  constructor(
    private readonly treasuryAddress = process.env.SEPOLIA_TREASURY_ADDRESS ??
      "0x5e7015c6fd7f578f6b87c63f48d91605d22b4d01",
    private readonly ethUsdRate = Number(process.env.DEMO_ETH_USD_RATE ?? "3200")
  ) {}

  allocateForUsd(amountUsd: number): TreasuryAllocation {
    const amountEth = Number((amountUsd / this.ethUsdRate).toFixed(6));

    return {
      treasuryAddress: this.treasuryAddress,
      amountEth,
      txHash: `0x${randomBytes(32).toString("hex")}`,
      swapMode: "demo",
      chain: "sepolia"
    };
  }
}
