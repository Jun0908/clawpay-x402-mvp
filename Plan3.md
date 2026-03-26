# Plan3

## Goal

`brief.md` の本質に対して、今のデモから最低限追加すべき機能だけを実装対象として整理する。

この Plan3 の目的は次の 1 文に集約される。

**AI が事前契約なしで、その場で API を選び、支払い、安全制御の中で実行できることを示す。**

## Must

### 1. Dynamic API Selection

AI または Router が、固定 API を手動で選ぶのではなく、タスクに応じて候補 API から選択できること。

必要な機能:

- 複数の paid API provider 定義
- provider ごとの価格、カテゴリ、説明
- task に応じた provider 選択ロジック
- hardcode された 1 本呼びではなく、候補比較の入口を作る

最低要件:

- 少なくとも 2 つ以上の paid API が候補になる
- Router が task を見て provider を決める

### 2. Price Comparison Before Purchase

「その場購入」を示すため、購入前に候補 API の価格を比較できること。

必要な機能:

- provider ごとの price metadata
- 候補一覧取得
- 最安または条件適合 provider を選ぶロジック
- 選定理由を result に含める

最低要件:

- 2 つ以上の provider を比較する
- Router が `price` を見て選択したことが分かる

### 3. Real x402-style External Purchase Path

ローカル seller だけでなく、「外部サービスをその場購入する」構造が必要。

必要な機能:

- 外部 provider 風の seller endpoint
- x402 互換の購入フロー
- API key なしで呼べること
- account signup 前提でないこと

最低要件:

- 自作でもよいので、Router から見て別 provider として購入する相手が 2 系統ある
- 片方は今の local seller でもよいが、もう片方は別サービスとして分離されていること

### 4. Daily Spend Limit

`brief.md` では `1回 / セッション / 日` の上限が重要なので、日次上限が必要。

必要な機能:

- `maxPerDayUsd`
- 日付単位の spend 集計
- 日次超過時の block

最低要件:

- ledger から日次支出を集計できる
- daily cap 超過を block できる

### 5. Parent / Child Wallet Separation

無制限課金対策として、親財布と子財布の分離が必要。

必要な機能:

- treasury or parent wallet
- agent execution 用の child wallet
- child wallet への配賦
- child wallet 側の spend 制御

最低要件:

- 親残高と子残高を分ける
- API 利用は child wallet からのみ消費する
- 親から子への top-up を明示的なイベントにする

### 6. Top-up Control

補給制御が必要。今は何回でも自由にチャージできるため、リスク制御として不足。

必要な機能:

- 1 日の top-up 回数制限
- 1 回の top-up 上限
- 1 日の top-up 総額上限

最低要件:

- wallet ごとの top-up count を記録する
- 上限超過時に top-up を拒否できる

### 7. Loop / Repeated Spend Protection

AI が同じ API を短時間に繰り返し買い続けるリスクを防ぐ必要がある。

必要な機能:

- 同一 provider の短時間連打検知
- 同一 task の繰り返し購入制限
- セッション中の連続購入回数制限

最低要件:

- 同一 provider の一定回数超過を block
- block reason を ledger に残す

### 8. Human Approval Threshold

`brief.md` で明示されている設計ポイントなので、高額支払いの承認閾値が必要。

今回人間がいない前提でも、機能としては必要。

必要な機能:

- `approvalRequiredAboveUsd`
- threshold 超過時の `pending_approval`
- 自動拒否 or 保留状態

最低要件:

- 一定額以上は自動実行されない
- ledger に「approval required」が残る

## Required Product Shape

Plan3 で必要なのは、デモを増やすことではなく、プロダクトの芯を次の形にすること。

1. AI が task を受ける
2. candidate API を列挙する
3. 価格と条件を比較する
4. policy を確認する
5. child wallet から支払う
6. 実行する
7. daily cap, loop guard, approval rule に違反したら止める

## Required Data Additions

最低限、次を追加する必要がある。

```ts
type ExtendedPolicyConfig = {
  allowlist: string[];
  maxPerCallUsd: number;
  maxPerSessionUsd: number;
  maxPerDayUsd: number;
  approvalRequiredAboveUsd?: number;
  maxTopupsPerDay: number;
  maxTopupPerDayUsd: number;
  maxSameProviderCallsPerSession: number;
};

type WalletHierarchy = {
  parentWalletId: string;
  childWalletId: string;
  allocatedUsd: number;
};

type ProviderQuote = {
  providerId: string;
  priceUsd: number;
  category: string;
  description: string;
};
```

## Required Backend Changes

### Router

- provider discovery / quoting
- provider selection logic
- daily cap evaluation
- loop guard evaluation
- approval threshold evaluation

### Wallet

- parent / child wallet structure
- allocation ledger
- child-only spend rule
- top-up limits

### Ledger

- session 集計だけでなく daily 集計
- top-up count 集計
- repeated spend detection 用の集計
- approval pending event

## Required Frontend Changes

フロントは増やしすぎない。

必要なのは次だけ。

- AI が選んだ provider
- 比較した価格
- 実際に使った provider
- child wallet 残高
- blocked reason

## Implementation Order

1. daily cap
2. approval threshold
3. loop guard
4. parent / child wallet
5. top-up control
6. provider quote model
7. dynamic provider selection
8. second external-style provider

## Definition of Done

Plan3 は次が満たされれば完了。

1. AI が 2 つ以上の provider 候補から選べる
2. 選定時に価格比較がある
3. daily cap がある
4. approval threshold がある
5. loop guard がある
6. parent / child wallet 分離がある
7. top-up control がある
8. child wallet からのみ paid API を消費する

## Non-goals

今回は次を含めない。

- 本物のカード決済
- 本物の on-chain swap
- 本物の marketplace
- 品質スコアの高度最適化

## Summary

Plan3 の Must は次の 8 つ。

1. Dynamic API Selection
2. Price Comparison
3. External-style Purchase Path
4. Daily Spend Limit
5. Parent / Child Wallet Separation
6. Top-up Control
7. Loop Protection
8. Approval Threshold
