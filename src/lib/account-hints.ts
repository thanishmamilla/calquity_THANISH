const ACCOUNT_HINTS: Array<{ id: string; names: string[] }> = [
  { id: "ACCT-001", names: ["northstar"] },
  { id: "ACCT-002", names: ["lumenworks", "lumen"] },
  { id: "ACCT-003", names: ["beacon"] },
  { id: "ACCT-004", names: ["axis"] },
];

export function mentionedAccountIds(text: string): string[] {
  const q = text.toLowerCase();
  return ACCOUNT_HINTS.filter((row) => row.names.some((name) => q.includes(name))).map((row) => row.id);
}
