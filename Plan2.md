# ClawPay Extension Plan 2

## 1. Goal

既存の ClawPay MVP を残したまま、次の拡張を追加する。

1. ユーザーが `クレジットカードもどき` でウォレットに入金できる
2. 入金をトリガーに `Sepolia ETH` を調達または割り当てできる
3. その価値を `USDC` に変換した状態で保持できる
4. 自作の有料 API を呼ぶたびに残高を減らせる
5. 既存の `402 -> pay -> retry` デモ、policy、ledger、dashboard は維持する

この拡張の主目的は、**「事前に残高を積む funded wallet モード」**を追加し、従来の都度支払いモードと並存させること。

## 2. Product Direction

今回の拡張では支払い体験を 2 モードに分ける。

### Mode A: 既存機能

- 既存のローカル x402 デモ
- `402 -> 自動支払い -> 再試行`
- demo-safe なローカル署名ベース

### Mode B: 新機能

- `Mock Card -> Treasury/Funding Service -> Sepolia ETH -> USDC Balance -> API利用で消費`
- funded balance を持つ agent wallet
- API 呼び出し時は wallet balance から差し引く

この 2 モードを並べることで、次のストーリーを見せられる。

- すぐ動く local-only demo
- 将来の on-chain 拡張を見据えた funded wallet demo

## 3. Key Principle

**既存 MVP を壊さず、拡張機能は feature extension として積む。**

そのため、次の方針を採用する。

- 既存の `seller`, `tool-router`, `ledger`, `dashboard` は残す
- 新機能は `funding`, `wallet`, `swap`, `balance ledger` のレイヤーとして追加する
- 最初は Sepolia 上の `USDC-like token` でもよい
- 本物の Sepolia USDC に強く依存しすぎない
- カード決済は必ず `mock processor` から始める

## 4. Scope

### In Scope

- Mock card funding UI / API
- funding request の生成
- Sepolia wallet の管理
- ETH funding の demo-safe 実装
- USDC balance 化の demo-safe 実装
- funded balance を使う paid API 消費
- 既存 ledger と別に wallet ledger を追加
- dashboard に funding 状態と wallet 残高を追加

### Out of Scope

- 実カード決済代行の本番接続
- KYC / AML
- 本番 custody
- cross-chain bridge
- 複雑な DEX 最適化
- price oracle の本番品質設計
- 本番 USDC 償還

## 5. Recommended Product Framing

### One-liner

**OpenClaw に「事前チャージ式の agent wallet」を持たせ、mock card から Sepolia 上の USDC 残高を積み、自作の有料 API を使うたびに安全に消費する。**

### Canonical demo story

1. ユーザーが mock card で `$5.00` をチャージする
2. システムが funding request を作る
3. Treasury/Funding Service が Sepolia ETH を確保する
4. システムが USDC balance を wallet に反映する
5. OpenClaw 互換 router が paid API を叩く
6. policy を通過したら funded USDC balance を減らす
7. result, spend log, remaining balance を返す

## 6. Architecture Extension

## Existing Components To Keep

- `packages/seller`
- `packages/tool-router`
- `data/spend-ledger.json`
- dashboard と CLI demo

## New Components To Add

1. `packages/funding`
   - mock card processor
   - funding request service
   - treasury allocator

2. `packages/wallet`
   - wallet registry
   - balance manager
   - funded spend engine

3. `packages/swap`
   - ETH -> USDC conversion abstraction
   - demo mode / on-chain mode の切替

4. `packages/contracts` または `contracts/`
   - Sepolia 用の `MockUSDC` ERC-20
   - 必要なら `TreasuryEscrow` or `TopUpManager`

5. `data/wallet-ledger.json`
   - funding
   - swap
   - debit
   - refund

## 7. Recommended Technical Path

Sepolia と USDC 周りは環境差分や流動性前提が大きいので、**2段階で作る**。

### Stage 1: Demo-safe on-chain hybrid

- Sepolia 上に `MockUSDC` を deploy
- funding 時に treasury が ETH を保持
- swap はサーバー内ロジックで `ETH value -> MockUSDC mint` として表現
- API 消費時は `MockUSDC` 相当残高を差し引く

### Stage 2: More realistic Sepolia mode

- Sepolia ETH を funding source に使う
- 実際の test token / swap router / relayer を使う
- funded wallet 残高を on-chain transaction と同期する

### Recommendation

まずは **Stage 1 を正式 MVP2** とする。

理由:

- 実カード接続なしで end-to-end を見せやすい
- Sepolia 上の不安定な外部依存を減らせる
- 「カードもどきでチャージし、USDC化して消費する」体験を十分表現できる

## 8. User Flows

## Flow A: Mock card top-up

1. UI で card number, expiry, amount を入力
2. `POST /api/funding/topup`
3. mock processor が決済成功を返す
4. funding request を ledger に記録
5. treasury が `pending -> funded` に更新
6. Sepolia wallet と USDC balance に反映
7. dashboard に残高を表示

## Flow B: Funded paid API call

1. Router に paid request が来る
2. seller が 402 を返す
3. router が policy を評価する
4. 追加で wallet balance を確認する
5. balance が十分なら funded payment を実行する
6. API result を返す
7. spend-ledger と wallet-ledger を両方更新する

## Flow C: Insufficient balance

1. wallet balance が不足
2. router は支払いを拒否
3. result に `insufficient funded balance` を返す
4. dashboard に top-up 導線を表示

## 9. New Feature Set

### Feature 1: Mock Card Funding

- fake card form
- Luhn check 程度の簡易バリデーション
- 常に成功する test card と失敗カードを用意
- 金額上限を設定

### Feature 2: Treasury Wallet

- サーバー管理の treasury wallet
- Sepolia RPC で残高確認
- funded event と wallet 反映を担当

### Feature 3: USDC Conversion Layer

- 最初は `conversion engine` として抽象化
- `demo conversion`: 指定レートで USDC-like balance 反映
- 将来 `real swap adapter` を差し替え可能にする

### Feature 4: Funded Wallet Balance

- session or agent ごとの wallet
- `availableUsd`
- `pendingUsd`
- `spentUsd`
- `lastFundedAt`

### Feature 5: Paid API Consumption

- 自作 API 呼び出しごとに USD 価格を減算
- consumption イベントを ledger に書く
- 既存 x402 payment path と共存

### Feature 6: Multi-ledger Audit

- `spend-ledger.json`: paid/blocked/error
- `wallet-ledger.json`: topup/swap/debit/refund
- dashboard で両方確認

## 10. Suggested Repo Additions

```txt
apps/
  web/
    src/
      server.ts
      demo.ts
      funding-demo.ts
packages/
  funding/
    src/
      mockCard.ts
      fundingService.ts
      treasury.ts
      fundingLedger.ts
  wallet/
    src/
      walletRegistry.ts
      balanceManager.ts
      fundedPayment.ts
      walletTypes.ts
  swap/
    src/
      conversionEngine.ts
      demoSwap.ts
      sepoliaAdapter.ts
contracts/
  src/
    MockUSDC.sol
    TopUpManager.sol
data/
  wallet-ledger.json
  wallet-state.json
```

## 11. Data Model

```ts
export type FundingRequest = {
  id: string;
  walletId: string;
  source: "mock-card";
  cardLast4: string;
  requestedUsd: number;
  status: "pending" | "funded" | "failed";
  createdAt: string;
  fundedAt?: string;
  txHash?: string;
};

export type WalletState = {
  walletId: string;
  chain: "sepolia";
  address: string;
  assetSymbol: "USDC";
  availableUsd: number;
  pendingUsd: number;
  spentUsd: number;
  lastFundedAt?: string;
};

export type WalletLedgerEntry = {
  id: string;
  walletId: string;
  action: "topup" | "swap" | "debit" | "refund" | "error";
  amountUsd: number;
  amountEth?: number;
  status: "pending" | "completed" | "failed";
  sourceRef?: string;
  txHash?: string;
  reason?: string;
  timestamp: string;
};

export type FundingConfig = {
  minTopupUsd: number;
  maxTopupUsd: number;
  defaultChain: "sepolia";
  swapMode: "demo" | "onchain";
};
```

## 12. API Plan

### Funding APIs

- `POST /api/funding/topup`
- `GET /api/funding/wallet/:walletId`
- `GET /api/funding/ledger/:walletId`
- `POST /api/funding/reset`

### Router APIs

既存の `POST /api/demo/run` を拡張する。

- `paymentMode: "x402-local" | "funded-wallet"`
- `walletId?: string`

例:

```json
{
  "task": "Research ExampleCorp and use premium tools if useful",
  "sessionId": "demo-session-2",
  "budgetUsd": 1.0,
  "allowedProviders": ["premium-company-profile"],
  "providerId": "premium-company-profile",
  "paymentMode": "funded-wallet",
  "walletId": "wallet-demo-1"
}
```

## 13. UI / Dashboard Plan

既存 dashboard に次のパネルを追加する。

### Panel A: Top Up

- card number
- expiry
- cvc
- amount USD
- submit button

### Panel B: Wallet Status

- wallet address
- chain: Sepolia
- available USDC
- pending topups
- total spent

### Panel C: Payment Mode

- `x402 local`
- `funded wallet`

### Panel D: Wallet Ledger

- top-up history
- swap history
- debit history
- latest tx hash

## 14. Seller / Router Changes

### Seller changes

- 既存 endpoint はそのまま
- 追加で `funded-only` な自作 API を増やしてもよい
- 価格は USD ベースの固定値を維持する

### Router changes

- 既存 policy evaluation は維持
- `paymentMode` に応じて payment strategy を切り替える
- `funded-wallet` の場合:
  - wallet 残高確認
  - debit 実行
  - success 時のみ seller retry

## 15. Payment Strategy Design

`PaymentStrategy` を導入して、既存機能を崩さないようにする。

```ts
interface PaymentStrategy {
  authorize(priceUsd: number, context: PaymentContext): Promise<PaymentAuthorization>;
  settle(auth: PaymentAuthorization): Promise<void>;
}
```

### Strategy 1: LocalX402Strategy

- 既存の shared-secret signed payment

### Strategy 2: FundedWalletStrategy

- wallet balance から debit
- wallet ledger に記録
- 必要なら on-chain tx hash を保存

## 16. Implementation Phases

### Phase 1: Funding foundation

- wallet state JSON
- wallet ledger JSON
- funding service
- mock card processor
- top-up API

### Phase 2: Demo conversion engine

- USD -> ETH reference conversion
- ETH -> USDC-like conversion
- wallet available balance 反映

### Phase 3: Router integration

- `paymentMode` 追加
- funded wallet balance check
- debit on API usage
- insufficient balance errors

### Phase 4: Dashboard extension

- top-up form
- wallet overview
- wallet ledger
- payment mode toggle

### Phase 5: Sepolia integration

- wallet/private key env 設定
- RPC client
- treasury balance check
- optional tx hash recording

### Phase 6: Contract track

- `MockUSDC` deploy
- mint / transfer flow
- optional escrow manager

## 17. Acceptance Criteria

### Core

- [ ] 既存の local x402 demo がそのまま動く
- [ ] mock card で top-up を作成できる
- [ ] top-up により wallet 残高が増える
- [ ] funded wallet mode で paid API を消費できる
- [ ] API 利用で wallet balance が減る
- [ ] 残高不足時に block される
- [ ] spend ledger と wallet ledger の両方が残る

### Demo

- [ ] 1 回の top-up デモができる
- [ ] 1 回の paid API spend デモができる
- [ ] 1 回の insufficient balance デモができる
- [ ] dashboard で wallet 状態を見せられる

### Stretch

- [ ] Sepolia `MockUSDC` contract deploy
- [ ] tx hash 表示
- [ ] real swap adapter の雛形

## 18. Risks and Mitigations

### Risk: Sepolia の外部依存が不安定

- Mitigation: Stage 1 は on-chain hybrid にする
- Mitigation: `MockUSDC` を正式デモ資産にする

### Risk: カードから ETH/USDC 変換が現実と乖離する

- Mitigation: mock card と明示する
- Mitigation: funding layer と swap layer を分離する

### Risk: 既存 demo が壊れる

- Mitigation: `PaymentStrategy` 抽象化で分岐
- Mitigation: existing route と tests を維持する

### Risk: Ledger が複雑化する

- Mitigation: `spend-ledger` と `wallet-ledger` を分ける
- Mitigation: session ledger と wallet ledger の責務を分離する

## 19. Demo Script Recommendation

最終的なデモは次の順で見せると分かりやすい。

1. 既存 `x402 local` モードで allowed purchase
2. 同モードで blocked purchase
3. mock card で `$5.00` top-up
4. wallet に `USDC` 残高が反映される
5. `funded-wallet` モードで premium API を実行
6. 残高が減る
7. 残高不足ケースを再現して block を見せる

## 20. Recommended Definition of Done

この Plan2 の完了条件は次の通り。

1. 既存 MVP のデモが維持されている
2. mock card から funding できる
3. Sepolia 向け wallet 状態を持てる
4. USDC-like balance が dashboard に出る
5. paid API 利用時に funded balance を消費できる
6. ledger で funding と spend の両方を追跡できる

## 21. Concrete Recommendation

今回の拡張は、まず **「Sepolia 接続つき hybrid demo」**として作るのが最適。

具体的には:

- 表向きの体験は `mock card -> Sepolia wallet -> USDC balance -> API spend`
- 実装の中心は `mock funding + wallet ledger + funded payment strategy`
- on-chain は `MockUSDC` と tx hash 表示までで十分

これなら、今あるプロダクトを壊さずに、次の一段上のストーリーをかなり自然に追加できる。
