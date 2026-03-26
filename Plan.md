# OpenClaw x402 MVP Plan

## 1. Objective

`x402-openclaw-codex-brief.md` に基づき、**OpenClaw が x402 で保護された有料 API を安全にオンデマンド購入できるローカル動作デモ**を 1 日で成立させる。

成功条件は次の 4 点です。

1. OpenClaw 互換のルーター経由で有料ツールを呼べる
2. x402 の `402 -> 支払い -> 再試行` フローが自動で完了する
3. ポリシーで許可・拒否を制御できる
4. 支出履歴と残予算を UI か CLI で確認できる

## 2. Scope

### In Scope

- ローカルで動く x402 保護 API を 1 つ実装する
- その API を呼ぶ Tool Router を実装する
- Router 内で以下を実装する
  - 402 検知
  - allowlist 判定
  - `maxPerCallUsd` 判定
  - `maxPerSessionUsd` 判定
  - 許可時の自動支払い
  - 支払い後の再試行
  - Spend Ledger 記録
- 許可ケースと拒否ケースを両方デモできるようにする
- Spend Summary を確認できる小さな UI または CLI を用意する

### Out of Scope

- 汎用マーケットプレイス化
- 複数ウォレット製品
- 複雑な認証や本番用カストディ
- 複数プロバイダの動的発見
- ブラウザ側ウォレット処理
- MCP を最初から必須にすること

## 3. Recommended Build Shape

最速で成立させるため、**TypeScript モノレポ or 単一アプリ構成**で進める。時間優先で、必要なら 1 アプリ内に寄せてもよい。

### Preferred components

1. `apps/web`
   - デモ実行 UI
   - ログ表示 UI
   - `api/demo`
   - `api/logs`
2. `packages/tool-router`
   - paid tool execution
   - policy evaluation
   - ledger write/read
   - x402 buyer flow
3. `packages/seller`
   - x402 保護された有料エンドポイント
   - `premium-company-profile`
   - 必要なら `expensive-deep-report`
4. `packages/shared`
   - 型定義

## 4. Architecture Decision

### Integration path

- **Phase 1:** HTTP endpoint として Router を公開する
- **Phase 2:** 余力があれば OpenClaw wrapper / MCP を追加する

### Persistence

- 最優先はシンプルさ
- `JSON file` または `SQLite` を採用する
- 1 日 MVP では **JSON file ledger** が最速

### Policy config

- `env` もしくは JSON 定義
- 初期値は固定でよい

### Payment path

- x402 の seller / buyer は **サーバーサイドのみ**
- testnet or demo-safe setup を使う

## 5. Core User Flow

1. OpenClaw 互換クライアントまたはデモ UI から Router を呼ぶ
2. Router が `premium-company-profile` を実行しようとする
3. Seller が `HTTP 402` と payment requirements を返す
4. Router が policy を評価する
5. 許可なら支払いし、同一リクエストを再試行する
6. Seller が premium JSON を返す
7. Router が spend event を ledger に保存する
8. Router が answer と spend summary を返す
9. UI/CLI が total spend, blocked calls, remaining budget を表示する

## 6. Deliverables

### Required deliverables

- `premium-company-profile` の x402 保護エンドポイント
- paid endpoint を呼ぶ Tool Router
- Policy Engine
- Spend Ledger
- 許可 / 拒否の両ケースを見せるデモ導線
- Spend を確認できる UI または CLI
- README の起動手順

### Stretch deliverables

- `expensive-deep-report`
- OpenClaw wrapper / skill
- MCP server
- Bazaar metadata

## 7. Implementation Plan

### Phase 0: Bootstrap

- TypeScript ベースのプロジェクトを初期化
- ディレクトリ構成を決める
- `.env.example` を用意する
- x402 公式 TypeScript パッケージを導入する

### Phase 1: Shared contracts

- Provider, Policy, SpendLog, ToolExecutionResult の型を定義する
- demo request / response 型を定義する
- provider IDs と price 定数を定義する

### Phase 2: Seller

- ローカル Seller サーバーを作成する
- `premium-company-profile` を x402 で保護する
- レスポンスは believable な premium JSON にする
- 可能なら `expensive-deep-report` を追加し、ブロック用に使う

### Phase 3: Policy Engine

- allowlist 判定
- `maxPerCallUsd` 判定
- `maxPerSessionUsd` 判定
- optional `approvalRequiredAboveUsd` を将来拡張用に定義
- denied reason を明示的に返す

### Phase 4: Spend Ledger

- `paid`, `blocked`, `error` を記録する
- session ごとの spend 集計を返せるようにする
- dashboard/CLI が読みやすい形式で保存する

### Phase 5: Tool Router

- demo input を受け取る HTTP endpoint を作る
- seller 呼び出しを実装する
- `402` を検知する
- policy 評価を行う
- 許可時のみ buyer flow を実行する
- 再試行後の結果を返す
- result に `spendSummary` と `events` を含める

### Phase 6: Demo UI / CLI

- 最短なら CLI を先に作る
- 余力があれば Next.js page で dashboard を作る
- 表示項目
  - session budget
  - total spend
  - paid calls
  - blocked calls
  - history

### Phase 7: Demo path

- allowed example を 1 つ用意する
- blocked example を 1 つ用意する
- 1 コマンドまたは 1 クリックで再現できるようにする

### Phase 8: Documentation and polish

- README にセットアップとデモ手順を記載する
- `.env.example` を更新する
- acceptance checklist を埋める

## 8. Suggested File Plan

```txt
apps/
  web/
    app/
      page.tsx
      logs/page.tsx
      api/
        demo/route.ts
        logs/route.ts
packages/
  tool-router/
    src/
      index.ts
      router.ts
      policy.ts
      ledger.ts
      paidClient.ts
      types.ts
  seller/
    src/
      server.ts
      premiumData.ts
  shared/
    src/
      types.ts
data/
  spend-ledger.json
.env.example
README.md
```

時間が厳しければ、`apps/web` に Router と Seller を一時的に同居させてもよい。

## 9. Data Contracts

```ts
export type PaidProvider = {
  id: string;
  name: string;
  endpoint: string;
  category: "company" | "news" | "enrichment";
};

export type PolicyConfig = {
  allowlist: string[];
  maxPerCallUsd: number;
  maxPerSessionUsd: number;
  approvalRequiredAboveUsd?: number;
};

export type SpendLog = {
  id: string;
  timestamp: string;
  sessionId: string;
  providerId: string;
  action: "paid" | "blocked" | "error";
  requestedUsd: number;
  approvedUsd: number;
  reason?: string;
  remainingBudgetUsd: number;
  requestSummary: string;
};

export type ToolExecutionResult = {
  ok: boolean;
  answer?: unknown;
  spendSummary: {
    totalSpentUsd: number;
    callsPaid: number;
    callsBlocked: number;
  };
  events: SpendLog[];
};
```

## 10. Demo Scenarios

### Scenario A: Allowed purchase

- Input task: company research
- Provider: `premium-company-profile`
- Price: 例 `0.05 USD`
- Policy: allowlisted, under per-call cap, under session cap
- Expected result: paid -> retried -> success

### Scenario B: Blocked purchase

- Input task: deep report
- Provider: `expensive-deep-report`
- Price: 例 `0.50 USD`
- Policy: exceeds `maxPerCallUsd` or not allowlisted
- Expected result: blocked, no payment, log written

## 11. Acceptance Checklist

### Core

- [ ] Local paid API returns `402` before payment
- [ ] Router completes one x402 payment flow
- [ ] Router retries successfully after payment
- [ ] Spend log persists locally
- [ ] At least one request is blocked by policy

### Demo

- [ ] One-command or one-click demo exists
- [ ] Allowed and blocked examples are both visible
- [ ] Final spend summary is displayed

### Nice to have

- [ ] OpenClaw wrapper/skill exists
- [ ] MCP server version exists
- [ ] Bazaar metadata exists

## 12. Risks and Mitigations

### Risk: x402 integration takes longer than expected

- Mitigation: seller を 1 endpoint のみに絞る
- Mitigation: UI より先に CLI で end-to-end を通す

### Risk: OpenClaw integration becomes a time sink

- Mitigation: HTTP endpoint を正式 MVP とする
- Mitigation: wrapper は stretch goal に落とす

### Risk: persistence adds overhead

- Mitigation: SQLite ではなく JSON ledger から始める

### Risk: demo becomes unclear

- Mitigation: allowed / blocked の 2 シナリオに固定する
- Mitigation: dashboard/CLI の表示項目を最小限にする

## 13. Execution Order

実装順は次を推奨する。

1. shared types
2. seller endpoint
3. router skeleton
4. policy engine
5. spend ledger
6. buyer flow with retry
7. allowed demo
8. blocked demo
9. UI/CLI
10. README

## 14. Definition of Done

この MVP は、ローカル環境で以下が連続して再現できれば完了とする。

1. デモ起動
2. premium lookup 実行
3. seller が `402` を返す
4. router が policy を評価する
5. router が支払いして再試行する
6. premium result が返る
7. ledger に spend が残る
8. 高額または非許可 provider は block される
9. UI/CLI で spend summary を確認できる

## 15. Assumptions

- まずは **HTTP integration が正式 MVP** とする
- OpenClaw の直接統合は必須ではなく、互換的に呼べる Router があればよい
- 永続化は軽量実装を優先する
- 支払いは testnet / demo-safe 構成を前提にする
