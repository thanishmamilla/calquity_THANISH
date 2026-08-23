/** True only when the user asked to change state, not merely whether a change is allowed. */
export function userRequestedWrite(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (isConfirmReply(t) || isRejectReply(t)) return false;
  const asking =
    /\b(can|could|should|may|is|are|do|does|will|would|what|why|explain|how much|am i)\b/.test(t);
  const explicitWrite =
    /\bplease (cancel|escalate|update|create)\b/.test(t) ||
    /\b(create (an )?(escalation|follow-?up|task))\b/.test(t) ||
    /\bescalate\b/.test(t) ||
    /\bupdate (the )?ticket\b/.test(t) ||
    /\bcancel (ord-|it|this|the (shipment|order))\b/.test(t);

  if (asking && !/\b(please|create an escalation)\b/.test(t)) return false;
  return explicitWrite;
}

export function isConfirmReply(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /^(y|yes|yeah|yep|ok|okay|confirm|confirmed|do it|go ahead|proceed|approve|lgtm)([.!]*)?$/.test(t);
}

export function isRejectReply(text: string): boolean {
  const t = text.toLowerCase().trim();
  return /^(n|no|nope|cancel|don't|dont|discard|stop|never ?mind|not now)([.!]*)?$/.test(t);
}
