export type Kind = 'trip' | 'house';
export type SplitType = 'equal' | 'exact' | 'shares';

export type Me = {
  id: string;
  display_name: string;
};

export type GroupSummary = {
  id: string;
  name: string;
  kind: Kind;
  currency: string;
  invite_code: string;
  member_count: number;
  my_balance_cents: number;
};

export type Member = {
  id: string;
  display_name: string;
  balance_cents: number;
};

export type Transfer = {
  from_user_id: string;
  from_name: string;
  to_user_id: string;
  to_name: string;
  amount_cents: number;
};

export type Share = {
  user_id: string;
  display_name: string;
  amount_cents: number;
  shares: number | null;
};

export type ExpenseActivity = {
  type: 'expense';
  id: string;
  description: string;
  amount_cents: number;
  payer_id: string;
  payer_name: string;
  split_type: SplitType;
  shares: Share[];
  created_at: string;
};

export type SettlementActivity = {
  type: 'settlement';
  id: string;
  from_user_id: string;
  from_name: string;
  to_user_id: string;
  to_name: string;
  amount_cents: number;
  created_at: string;
};

export type Activity = ExpenseActivity | SettlementActivity;

export type GroupDetail = {
  id: string;
  name: string;
  kind: Kind;
  currency: string;
  invite_code: string;
  members: Member[];
  transfers: Transfer[];
  activity: Activity[];
};

export type ExpenseInput = {
  description: string;
  amount_cents: number;
  payer_id: string;
  split_type: SplitType;
  participants: { user_id: string; amount_cents?: number; shares?: number }[];
};

export type SettlementInput = {
  from_user_id: string;
  to_user_id: string;
  amount_cents: number;
};
